/**
 * The reasoning pass. Layer 2 of the decision engine.
 *
 * It never produces a score. It explains the score the deterministic function
 * already produced, and when it disagrees it says so in risks and tier_opinion,
 * which a human resolves later. ARCHITECTURE.md section 5.
 *
 *   node scripts/reason.mjs                 top 150 accounts
 *   node scripts/reason.mjs --limit 10      a smaller slice
 *   node scripts/reason.mjs --dry-run       build prompts, call nothing
 *
 * With no usable OPENAI_API_KEY this exits cleanly and says the pass is
 * disabled. It does not fail the build and it does not write invented prose.
 */
import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'
import OpenAI from 'openai'

dotenv.config({ path: '.env.local', quiet: true })

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}

const LIMIT = Number(value('limit', '150'))
const DRY_RUN = flag('dry-run')
const PROMPT_VERSION = 'reason-v1'
const DEFAULT_MODEL = 'gpt-4.1-mini'

// Kept in sync with src/lib/server/ai/pricing.ts. Data law 7.
const MODEL_RATES = {
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const MODEL = process.env.OPENAI_MODEL || DEFAULT_MODEL

function reasoningStatus() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { available: false, reason: 'OPENAI_API_KEY is not set' }
  if (key.length < 40)
    return {
      available: false,
      reason: `OPENAI_API_KEY looks like a placeholder (${key.length} chars)`,
    }
  if (!(MODEL in MODEL_RATES))
    return {
      available: false,
      reason: `no cost rate for model "${MODEL}" in pricing.ts (data law 7)`,
    }
  return { available: true, reason: null }
}

function costUsd(inputTokens, outputTokens) {
  const rate = MODEL_RATES[MODEL]
  if (!rate) return null
  const usd =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  return Math.round(usd * 10_000) / 10_000
}

const SYSTEM_PROMPT = `You explain BD account scores for ALAC, an aerospace and defense recruiting firm. Adrian, the founder, reads what you write before deciding who to call this week.

You do not produce the score. The score is already computed by a deterministic function, and you are shown its full arithmetic. Your job is to explain it in the language a recruiter uses, and to say when you think it is wrong.

Rules you must follow:

1. Ground every factual claim in the evidence supplied to you. Each signal has an id. When you assert something happened, cite the id of the signal it came from in cited_signal_ids. Never cite an id that was not supplied. A response citing anything else is discarded.
2. Do not invent facts. No headcount, funding, contract award, or person that is not in the input. If the input is thin, say the input is thin. "Little recent signal on this account" is a useful sentence; a plausible invented one is not.
3. Do not restate the score. Adrian can read the number. Tell him what it means and what to do.
4. next_best_action is a concrete first move for a recruiting firm selling a search engagement: who to contact and on what pretext. Not "conduct further research".
5. If you think the number is wrong, say so in risks and set tier_opinion. That becomes a recommendation for a human to approve. You never move the number yourself.
6. Write like a person briefing a colleague. No preamble, no bullet-point resumes of the input, no hedging padding.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'why_now',
    'next_best_action',
    'risks',
    'cited_signal_ids',
    'confidence',
    'tier_opinion',
  ],
  properties: {
    why_now: { type: 'string' },
    next_best_action: { type: 'string' },
    risks: { type: 'string' },
    cited_signal_ids: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    tier_opinion: {
      type: ['string', 'null'],
      enum: ['top_25', 'next_25', 'watch', 'none', null],
    },
  },
}

function buildUserPrompt(a) {
  const lines = []
  lines.push(`ACCOUNT: ${a.company_name}`)
  if (a.domain) lines.push(`Domain: ${a.domain}`)
  if (a.vertical) lines.push(`Vertical: ${a.vertical}`)
  if (a.employee_band) lines.push(`Employees: ${a.employee_band}`)
  if (a.location) lines.push(`Location: ${a.location}`)
  if (a.defense_verdict) lines.push(`Defense verdict: ${a.defense_verdict}`)
  if (a.open_roles !== null) lines.push(`Open roles: ${a.open_roles}`)
  lines.push(`Current tier: ${a.tier ?? 'unassigned'}`)
  lines.push('')
  lines.push(`DETERMINISTIC SCORE: ${a.score}/100`)
  lines.push('Full arithmetic:')
  lines.push(JSON.stringify(a.breakdown, null, 1))
  lines.push('')

  if (a.signals.length) {
    lines.push('EVIDENCE ON FILE (cite these ids, and only these):')
    for (const s of a.signals) {
      lines.push(
        `- id=${s.id} [${s.kind}${s.date ? ` ${s.date}` : ''}] ${s.detail}`,
      )
    }
  } else {
    lines.push('EVIDENCE ON FILE: none. There are no signals for this account.')
    lines.push('Say so plainly. cited_signal_ids must be empty.')
  }
  lines.push('')

  if (a.contacts.length) {
    lines.push('WARM CONTACTS (first-degree connections of the ALAC team):')
    for (const c of a.contacts) {
      lines.push(
        `- ${c.name}${c.title ? ` — ${c.title}` : ''}${c.is_decision_maker ? ' [decision maker]' : ''}`,
      )
    }
  } else {
    lines.push('WARM CONTACTS: none. This is a cold account.')
  }
  return lines.join('\n')
}

/** The grounding rule, enforced in code. */
function ungroundedCitations(cited, supplied) {
  const allowed = new Set(supplied.map((s) => s.id))
  return (cited ?? []).filter((id) => !allowed.has(id))
}

async function main() {
  const status = reasoningStatus()
  const sql = neon(process.env.DATABASE_URL)

  if (!status.available && !DRY_RUN) {
    console.log('')
    console.log('  Reasoning pass DISABLED')
    console.log(`  Reason: ${status.reason}`)
    console.log('')
    console.log('  Deterministic scores are unaffected: every account keeps its')
    console.log('  score and its full breakdown. The decision card will show the')
    console.log('  arithmetic and say the written read is unavailable, rather')
    console.log('  than inventing prose. Set a real key to enable it.')
    console.log('')
    process.exit(0)
  }

  const [org] = await sql`select id from orgs order by created_at limit 1`
  const orgId = org.id

  // Top N by current score, excluding suppressed and current-client rows: the
  // same population the tier proposal ranks. Reasoning is expensive, so it
  // runs where a human will actually read it.
  const rows = await sql`
    with latest as (
      select distinct on (account_id) account_id, id, score, breakdown
        from account_scores
       where org_id = ${orgId}
       order by account_id, scored_at desc
    )
    select a.id, a.company_name, a.domain, a.vertical, a.employee_band,
           a.hq_location as location, a.defense_verdict,
           a.open_roles_count as open_roles, a.tier,
           l.id as score_id, l.score, l.breakdown
      from accounts a
      join latest l on l.account_id = a.id
     where a.org_id = ${orgId}
       and not a.is_suppressed
     order by l.score desc, a.company_name
     limit ${LIMIT}
  `

  console.log(`\nReasoning pass over ${rows.length} accounts`)
  console.log(`Model: ${MODEL}${DRY_RUN ? '  (DRY RUN — no API calls)' : ''}\n`)

  // Pull evidence for the whole batch in two queries rather than 2N.
  const ids = rows.map((r) => r.id)
  const signals = await sql`
    select id, account_id, kind, occurred_at, headline, detail
      from signals
     where account_id = any(${ids})
     order by occurred_at desc nulls last
  `
  const contacts = await sql`
    select p.full_name as name, p.title, p.is_decision_maker, p.account_id
      from people p
     where p.account_id = any(${ids})
     order by p.is_decision_maker desc, p.full_name
  `

  const byAccount = new Map(ids.map((id) => [id, { signals: [], contacts: [] }]))
  for (const s of signals) {
    byAccount.get(s.account_id)?.signals.push({
      id: s.id,
      kind: s.kind,
      date: s.occurred_at
        ? new Date(s.occurred_at).toISOString().slice(0, 10)
        : null,
      // headline is the human-readable summary; detail carries the extra
      // context when there is any. Both go to the model so it can cite either.
      detail: [s.headline, s.detail].filter(Boolean).join(' — ') || '(no detail)',
    })
  }
  for (const c of contacts) byAccount.get(c.account_id)?.contacts.push(c)

  if (DRY_RUN) {
    const sample = rows[0]
    const ev = byAccount.get(sample.id)
    console.log('--- sample prompt ---')
    console.log(buildUserPrompt({ ...sample, ...ev }))
    console.log('--- end ---\n')
    const totalSignals = rows.reduce(
      (n, r) => n + byAccount.get(r.id).signals.length,
      0,
    )
    console.log(`Would send ${rows.length} requests.`)
    console.log(`Evidence available: ${totalSignals} signals across the batch.`)
    const noEvidence = rows.filter((r) => !byAccount.get(r.id).signals.length)
    console.log(`Accounts with no signals at all: ${noEvidence.length}`)
    process.exit(0)
  }

  // Data law 3: the run row exists before the first API call, never after.
  const [run] = await sql`
    insert into agent_runs (org_id, kind, trigger, model, prompt_version, params, items_total)
    values (${orgId}, 'score_reasoning', 'manual', ${MODEL}, ${PROMPT_VERSION},
            ${JSON.stringify({ limit: LIMIT })}::jsonb, ${rows.length})
    returning id
  `

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 })
  const started = Date.now()
  let ok = 0
  let failed = 0
  let inTok = 0
  let outTok = 0
  const log = []

  for (const [i, row] of rows.entries()) {
    const ev = byAccount.get(row.id)
    const label = `${String(i + 1).padStart(3)}/${rows.length} ${row.company_name}`
    try {
      const res = await openai.responses.parse({
        model: MODEL,
        instructions: SYSTEM_PROMPT,
        input: buildUserPrompt({ ...row, ...ev }),
        text: {
          format: {
            type: 'json_schema',
            name: 'account_reasoning',
            strict: true,
            schema: SCHEMA,
          },
        },
      })

      inTok += res.usage?.input_tokens ?? 0
      outTok += res.usage?.output_tokens ?? 0

      const parsed = res.output_parsed
      if (!parsed) throw new Error('model returned no parsed output')

      // The grounding rule. A response citing an id we never supplied is
      // rejected outright and counted as a failure. Enforced here, not merely
      // asked for in the prompt.
      const bogus = ungroundedCitations(parsed.cited_signal_ids, ev.signals)
      if (bogus.length) {
        throw new Error(
          `ungrounded citation(s): ${bogus.slice(0, 3).join(', ')}`,
        )
      }

      const opinion =
        parsed.tier_opinion === 'none' ? null : parsed.tier_opinion

      await sql`
        update account_scores
           set reasoning        = ${parsed.why_now},
               why_now          = ${parsed.why_now},
               next_best_action = ${parsed.next_best_action},
               risks            = ${parsed.risks || null},
               cited_signal_ids = ${parsed.cited_signal_ids ?? []},
               confidence       = ${parsed.confidence},
               model            = ${MODEL},
               prompt_version   = ${PROMPT_VERSION},
               agent_run_id     = ${run.id},
               input_tokens     = ${res.usage?.input_tokens ?? null},
               output_tokens    = ${res.usage?.output_tokens ?? null}
         where id = ${row.score_id}
      `

      ok++
      const flag = opinion ? `  [proposes ${opinion}]` : ''
      console.log(`  ok   ${label}${flag}`)
    } catch (err) {
      failed++
      const msg = err?.message ?? String(err)
      log.push({ account: row.company_name, error: msg })
      console.log(`  FAIL ${label} — ${msg}`)
    }
  }

  const cost = costUsd(inTok, outTok)
  await sql`
    update agent_runs
       set status = ${failed === 0 ? 'complete' : 'partial'},
           items_ok = ${ok}, items_failed = ${failed},
           input_tokens = ${inTok}, output_tokens = ${outTok},
           cost_usd = ${cost ?? 0},
           finished_at = now(), duration_ms = ${Date.now() - started},
           log = ${JSON.stringify(log)}::jsonb
     where id = ${run.id}
  `

  // Data law 9: honest counts. A run that failed 12 of 150 says so.
  console.log('')
  console.log(`  ${ok} explained, ${failed} failed, of ${rows.length}`)
  console.log(`  ${inTok} input + ${outTok} output tokens`)
  console.log(`  cost: ${cost === null ? 'unknown (no rate for model)' : '$' + cost}`)
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
