// Research a company and draft the first message to its best contact.
//
//   npm run draft -- "Acme Aerospace"              plan, shows what it would do
//   npm run draft -- --apply "Acme Aerospace"      research, draft, write
//   npm run draft -- --apply --band now      every company in Work now
//   npm run draft -- --apply "Acme Aerospace" --person "Jane Doe"
//
// Two outputs per company:
//
//   1. a fuller explanation of what changed, with sources
//   2. one message to one person, that could not be sent to anyone else
//
// Nothing is sent. Every draft is written for a human to read, edit and send
// themselves, which is the desk's own rule for outbound.

import { config } from "dotenv";
import pg from "pg";
import { writeFirstMessage } from "../src/lib/server/ai/outreach.mjs";
import { researchCompany, exaAvailable } from "../src/lib/server/integrations/exa.mjs";
import OpenAI from "openai";
import { DEFAULT_MODEL } from "../src/lib/server/ai/rates.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const BAND = (() => {
  const i = process.argv.indexOf("--band");
  return i >= 0 ? process.argv[i + 1] : null;
})();
const PERSON = (() => {
  const i = process.argv.indexOf("--person");
  return i >= 0 ? process.argv[i + 1] : null;
})();
const names = process.argv.slice(2).filter((a, i, arr) => {
  if (a.startsWith("--")) return false;
  // Drop the value that follows a flag, or "now" from "--band now" is treated
  // as a company name.
  const prev = arr[i - 1];
  return prev !== "--band" && prev !== "--person";
});

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. See .env.example.");
  process.exit(1);
}
if (!exaAvailable()) {
  console.log("EXA_API_KEY is not set.");
  console.log("Messages will be written from stored facts only, which makes them");
  console.log("markedly less specific. Get a key at https://exa.ai\n");
}

// A Pool, not a Client. The per account reads run concurrently in a
// Promise.all, and a single Client serialises them and warns: one connection
// cannot execute five queries at once.
const client = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 6,
});

/**
 * How relevant a known contact is to a recruiting approach.
 *
 * Ranking on the decision maker flag alone does not work: nearly every senior
 * contact carries it, so they tie, and the tiebreak is alphabetical. At
 * Acme Aerospace that put a Head of Marketing at the top of a company hiring twenty
 * engineers. Marketing does not own the requisition.
 *
 * Mirrors the SQL in targetsForAccount. The two must agree, or the person the
 * message is written to differs from the person shown at the top of the screen.
 */
function warmRank(p) {
  const t = String(p.title ?? "").toLowerCase();
  if (/talent|recruit|people ops|head of people/.test(t)) return 95;
  if (/engineer|technical|cto|chief technology/.test(t)) return 88;
  if (/chief|founder|ceo|coo|president/.test(t)) return 82;
  if (/program|product|operations/.test(t)) return 74;
  return p.is_decision_maker ? 70 : 55;
}

/**
 * Expand a thin signal into something worth reading.
 *
 * Only ever runs on signals that need it. The workbook's own entries are
 * already written by hand and read better than anything a model would produce,
 * so rewriting them would be a downgrade dressed up as an improvement.
 */
async function detailSignal(signal, company, research) {
  if (research.length === 0) return null;

  const oa = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const context = [
    `COMPANY: ${company}`,
    `THE SIGNAL, as recorded: ${signal.what_happened}`,
    signal.the_number ? `Amount: ${signal.the_number}` : "",
    "",
    "RECENT COVERAGE:",
    ...research.map((r) => `[${r.published ?? "undated"}] ${r.title}\n${r.text.slice(0, 900)}`),
  ]
    .filter(Boolean)
    .join("\n");

  const res = await oa.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: [
          "You explain what just happened at a company, for a recruiting firm founder.",
          "He needs to understand it in one read and know whether it means they are hiring.",
          "",
          "Write two or three sentences. Say what happened, how big it is, and what it",
          "implies for their hiring. Use the numbers and dates from the coverage.",
          "",
          "Use ONLY facts present in the coverage. If it is not there, do not say it.",
          "No em dashes. No marketing language. No speculation dressed as fact.",
        ].join("\n"),
      },
      { role: "user", content: context },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "signal_detail",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["detail"],
          properties: {
            detail: { type: "string", description: "Two or three sentences." },
          },
        },
      },
    },
    temperature: 0.2,
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const d = String(j.detail ?? "");
    // Same rule as everywhere else: an em dash means the house style was
    // ignored, so the output is not used.
    return d.includes("—") ? null : d;
  } catch {
    return null;
  }
}

const run = async () => {
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  let accounts;
  if (BAND) {
    accounts = (
      await client.query(
        `select id, company_name, domain, employee_count
           from tam_accounts
          where org_id = $1 and work_band = $2
          order by work_score desc nulls last`,
        [orgId, BAND],
      )
    ).rows;
  } else if (names.length > 0) {
    accounts = [];
    for (const n of names) {
      const { rows } = await client.query(
        `select id, company_name, domain, employee_count
           from tam_accounts
          where org_id = $1 and company_name ilike $2
          order by work_score desc nulls last limit 1`,
        [orgId, `%${n}%`],
      );
      if (rows.length === 0) {
        console.error(`No account matches "${n}".`);
        process.exit(1);
      }
      accounts.push(rows[0]);
    }
  } else {
    console.error('Name a company or a band:\n  npm run draft -- "Acme Aerospace"\n  npm run draft -- --band now');
    process.exit(1);
  }

  console.log(`${accounts.length} ${accounts.length === 1 ? "company" : "companies"}`);
  console.log(`Research: ${exaAvailable() ? "Exa" : "stored facts only"}`);
  console.log(`Cost: roughly a cent per company\n`);

  if (!APPLY) {
    for (const a of accounts.slice(0, 10)) console.log(`  ${a.company_name}`);
    console.log("\nPlan only. Rerun with --apply.");
    await client.end();
    return;
  }

  const runRow = await client.query(
    `insert into agent_runs (org_id, kind, status, trigger, params, started_at)
     values ($1, 'draft_message', 'running', 'manual', $2::jsonb, now()) returning id`,
    [orgId, JSON.stringify({ band: BAND, names })],
  );
  const runId = runRow.rows[0].id;

  let drafted = 0;
  let rejected = 0;
  let detailed = 0;
  let cost = 0;

  try {
    for (const a of accounts) {
      console.log(`\n=== ${a.company_name} ===`);

      const [signals, roles, targets, warm, stats] = await Promise.all([
        client.query(
          `select id, what_happened, the_number, signal_date, source::text as source, detail
             from heat_signals where org_id=$1 and account_id=$2
            order by heat_score desc nulls last limit 3`,
          [orgId, a.id],
        ),
        client.query(
          `select title, location, job_function, posted_at from account_roles
            where org_id=$1 and account_id=$2 and qualified
            order by posted_at desc nulls last limit 12`,
          [orgId, a.id],
        ),
        client.query(
          `select id, full_name, title, linkedin_url, is_warm, rank_score
             from account_targets where org_id=$1 and account_id=$2
            order by rank_score desc nulls last`,
          [orgId, a.id],
        ),
        client.query(
          `select full_name, title, linkedin_url, is_decision_maker
             from people where org_id=$1 and account_id=$2
            order by is_decision_maker desc limit 8`,
          [orgId, a.id],
        ),
        // Counted over every qualified role, because the roles query above is
        // capped at 12 for the prompt and a count off that sample would state
        // "12 open roles" for a company with 44.
        client.query(
          `select count(*)::int as total,
                  count(distinct location) filter (where location is not null)::int as sites,
                  count(distinct job_function) filter (where job_function is not null)::int as fns,
                  array_agg(distinct location) filter (where location is not null) as locations
             from account_roles where org_id=$1 and account_id=$2 and qualified`,
          [orgId, a.id],
        ),
      ]);

      // Research once and reuse it for both outputs, because the same articles
      // answer both questions and Exa charges per search.
      let research = [];
      if (exaAvailable()) {
        try {
          research = await researchCompany(a.company_name, { domain: a.domain });
          console.log(`  research: ${research.length} recent articles`);
        } catch (err) {
          console.log(`  research failed: ${String(err.message).slice(0, 90)}`);
        }
      }

      // ---- 1. explain what changed, for the thin ones only ----------------
      for (const s of signals.rows) {
        // A workbook signal is already well written by a human, and a signal
        // already detailed does not need doing twice.
        if (s.source === "workbook" || s.detail) continue;
        const detail = await detailSignal(s, a.company_name, research);
        if (detail) {
          await client.query(
            `update heat_signals
                set detail=$2, sources=$3::jsonb, detail_model=$4, detailed_at=now()
              where id=$1`,
            [s.id, detail, JSON.stringify(research.map((r) => r.url).filter(Boolean)), DEFAULT_MODEL],
          );
          detailed += 1;
          console.log(`  detailed: ${detail.slice(0, 90)}...`);
        }
      }

      // ---- 2. the message, to the best contact ----------------------------
      // Warm contacts first: someone who will recognise the sender is a better
      // first message than a stranger with a better title.
      const pool = [
        ...warm.rows.map((w) => ({
          full_name: w.full_name,
          title: w.title,
          linkedin_url: w.linkedin_url,
          is_warm: true,
          rank: warmRank(w),
          id: null,
        })),
        ...targets.rows.map((t) => ({
          full_name: t.full_name,
          title: t.title,
          linkedin_url: t.linkedin_url,
          is_warm: t.is_warm,
          rank: t.rank_score ?? 0,
          id: t.id,
        })),
      ].sort((x, y) => y.rank - x.rank);

      const person = PERSON
        ? pool.find((p) => p.full_name.toLowerCase().includes(PERSON.toLowerCase()))
        : pool[0];

      if (!person) {
        console.log("  no contact to write to, skipped");
        continue;
      }

      const out = await writeFirstMessage({
        company: { name: a.company_name, domain: a.domain, employees: a.employee_count },
        person,
        signals: signals.rows,
        roles: roles.rows,
        warmContacts: warm.rows,
        roleStats: stats.rows[0]
          ? {
              total: Number(stats.rows[0].total),
              sites: Number(stats.rows[0].sites),
              functions: Number(stats.rows[0].fns),
              locations: stats.rows[0].locations ?? [],
            }
          : null,
      });
      cost += out.cost ?? 0;

      if (!out.message) {
        rejected += 1;
        console.log(`  message REJECTED: ${out.rejected}`);
        continue;
      }

      await client.query(
        `insert into outreach_drafts (org_id, account_id, target_id, person_name, channel,
           body, opening_line, why_this_angle, facts_used, sources, model)
         values ($1,$2,$3,$4,'linkedin',$5,$6,$7,$8::jsonb,$9::jsonb,$10)
         on conflict (org_id, account_id, person_name, channel) do update set
           body=excluded.body, opening_line=excluded.opening_line,
           why_this_angle=excluded.why_this_angle, facts_used=excluded.facts_used,
           sources=excluded.sources, model=excluded.model, drafted_at=now(),
           approved=false`,
        [
          orgId, a.id, person.id, person.full_name,
          out.message.message, out.message.opening_line, out.message.why_this_angle,
          JSON.stringify(out.message.facts_used ?? []),
          JSON.stringify(out.sources ?? []),
          out.model,
        ],
      );
      drafted += 1;

      console.log(`  to: ${person.full_name}, ${person.title ?? "?"}${person.is_warm ? " (known)" : ""}`);
      console.log(`  ---`);
      for (const line of out.message.message.split("\n")) console.log(`  ${line}`);
      console.log(`  ---`);
      console.log(`  angle: ${out.message.why_this_angle}`);
    }

    await client.query(
      `update agent_runs set status='complete', items_total=$2, items_ok=$3,
              items_failed=$4, cost_usd=$5, finished_at=now() where id=$1`,
      [runId, accounts.length, drafted, rejected, cost],
    );

    console.log(`\n  ${drafted} drafted, ${rejected} rejected, ${detailed} signals explained`);
    console.log(`  cost: $${cost.toFixed(4)}`);
  } catch (err) {
    await client
      .query("update agent_runs set status='failed', error=$2, finished_at=now() where id=$1", [
        runId, String(err?.message ?? err).slice(0, 2000),
      ])
      .catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
};

run().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
