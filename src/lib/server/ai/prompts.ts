import 'server-only'

/**
 * Bump this whenever the prompt or schema changes. It is stored on every
 * account_scores row, so a future reader can tell which rows came from which
 * version of the instructions rather than assuming they are comparable.
 */
export const PROMPT_VERSION = 'reason-v1'

export const SYSTEM_PROMPT = `You explain BD account scores for ALAC, an aerospace and defense recruiting firm. Adrian, the founder, reads what you write before deciding who to call this week.

You do not produce the score. The score is already computed by a deterministic function, and you are shown its full arithmetic. Your job is to explain it in the language a recruiter uses, and to say when you think it is wrong.

Rules you must follow:

1. Ground every factual claim in the evidence supplied to you. Each signal has an id. When you assert something happened, cite the id of the signal it came from in cited_signal_ids. Never cite an id that was not supplied. A response citing anything else is discarded.
2. Do not invent facts. No headcount, funding, contract award, or person that is not in the input. If the input is thin, say the input is thin. "Little recent signal on this account" is a useful sentence; a plausible invented one is not.
3. Do not restate the score. Adrian can read the number. Tell him what it means and what to do.
4. next_best_action is a concrete first move for a recruiting firm selling a search engagement: who to contact and on what pretext. Not "conduct further research".
5. If you think the number is wrong, say so in risks and set tier_opinion. That becomes a recommendation for a human to approve. You never move the number yourself.
6. Write like a person briefing a colleague. No preamble, no bullet-point resumes of the input, no hedging padding.`

export interface AccountInput {
  company: string
  domain: string | null
  vertical: string | null
  employees: string | null
  location: string | null
  defenseVerdict: string | null
  openRoles: number | null
  currentTier: string | null
  score: number
  breakdown: unknown
  signals: { id: string; kind: string; date: string | null; detail: string }[]
  contacts: { name: string; title: string | null; decisionMaker: boolean }[]
}

export function buildUserPrompt(a: AccountInput): string {
  const lines: string[] = []

  lines.push(`ACCOUNT: ${a.company}`)
  if (a.domain) lines.push(`Domain: ${a.domain}`)
  if (a.vertical) lines.push(`Vertical: ${a.vertical}`)
  if (a.employees) lines.push(`Employees: ${a.employees}`)
  if (a.location) lines.push(`Location: ${a.location}`)
  if (a.defenseVerdict) lines.push(`Defense verdict: ${a.defenseVerdict}`)
  if (a.openRoles !== null) lines.push(`Open roles: ${a.openRoles}`)
  lines.push(`Current tier: ${a.currentTier ?? 'unassigned'}`)
  lines.push('')
  lines.push(`DETERMINISTIC SCORE: ${a.score}/100`)
  lines.push('Full arithmetic:')
  lines.push(JSON.stringify(a.breakdown, null, 1))
  lines.push('')

  if (a.signals.length) {
    lines.push('EVIDENCE ON FILE (cite these ids, and only these):')
    for (const s of a.signals) {
      lines.push(`- id=${s.id} [${s.kind}${s.date ? ` ${s.date}` : ''}] ${s.detail}`)
    }
  } else {
    lines.push('EVIDENCE ON FILE: none. There are no signals for this account.')
    lines.push('Say so plainly. cited_signal_ids must be empty.')
  }
  lines.push('')

  if (a.contacts.length) {
    lines.push('WARM CONTACTS (first-degree connections of the ALAC team):')
    for (const c of a.contacts) {
      lines.push(`- ${c.name}${c.title ? `, ${c.title}` : ''}${c.decisionMaker ? ' [decision maker]' : ''}`)
    }
  } else {
    lines.push('WARM CONTACTS: none. This is a cold account.')
  }

  return lines.join('\n')
}

/**
 * Forced schema. The model must return exactly this shape, so there is no
 * parsing step that can silently half-succeed.
 */
export const REASONING_SCHEMA = {
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
    why_now: {
      type: 'string',
      description:
        'One or two sentences on why this account is worth attention now, or why it is not. Grounded in the supplied evidence.',
    },
    next_best_action: {
      type: 'string',
      description:
        'The concrete first move: who to contact and on what pretext.',
    },
    risks: {
      type: 'string',
      description:
        'What could make this a waste of time, including disagreement with the computed score. Empty string if none.',
    },
    cited_signal_ids: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Ids of supplied signals backing the claims above. Only ids present in the input.',
    },
    confidence: {
      type: 'number',
      description: '0 to 1. How much the evidence supports this read.',
    },
    tier_opinion: {
      type: ['string', 'null'],
      enum: ['top_25', 'next_25', 'watch', 'none', null],
      description:
        'Where this account belongs, if you disagree with the current tier. Null or "none" if you agree.',
    },
  },
} as const

export interface Reasoning {
  why_now: string
  next_best_action: string
  risks: string
  cited_signal_ids: string[]
  confidence: number
  tier_opinion: string | null
}

/**
 * The grounding rule, enforced in code rather than merely requested in the
 * prompt (ARCHITECTURE.md section 5). Returns the ids the model cited that
 * were never supplied. Non-empty means the response is rejected.
 */
export function ungroundedCitations(
  cited: string[],
  supplied: { id: string }[],
): string[] {
  const allowed = new Set(supplied.map((s) => s.id))
  return cited.filter((id) => !allowed.has(id))
}
