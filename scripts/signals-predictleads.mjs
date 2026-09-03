// Pull signals from PredictLeads for the accounts actually being worked.
//
//   npm run signals            plan, shows what it would fetch and score
//   npm run signals -- --apply fetch, score, write
//   npm run signals -- --apply --band now
//   npm run signals -- --apply --since 2026-02-01
//
// Scoped to the Work now and Up next bands by default. The backlog is 910
// companies and none of them are being contacted this week, so pulling them
// would spend credits to produce a number nobody reads.
//
// Nothing is written without --apply.

import { config } from "dotenv";
import pg from "pg";
import { normCompany } from "../src/lib/server/import/normalize.mjs";
import { scoreHeat } from "../src/lib/scoring/heat.mjs";
import {
  companySignals,
  describeSignal,
  predictLeadsAvailable,
  CATEGORY_WEIGHT,
  PredictLeadsError,
} from "../src/lib/server/integrations/predictleads.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BAND = arg("--band", null);
const SINCE = arg("--since", isoDaysAgo(365));

// Below this, PredictLeads is guessing. Observed live: a chief strategy officer
// hire scored 0.52 and its cited article was about something else entirely,
// while every event above 0.7 checked out. A wrong signal in front of the
// operator costs more than a missing one.
const MIN_CONFIDENCE = 0.65;

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

if (!predictLeadsAvailable()) {
  console.error("PREDICTLEADS_API_KEY and PREDICTLEADS_API_TOKEN must both be set. See .env.example.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 4,
});

/**
 * Hiring urgency from one signal, out of 30.
 *
 * Two multipliers on the category weight. Recency, because a round closed
 * eleven months ago has already been staffed against. Confidence, because
 * the provider tells us how sure it is and ignoring that would treat a guess
 * and a certainty as the same fact.
 *
 * Size lifts a financing event but never past the cap: a $500M round and a
 * $50M round both mean "they are hiring", and the difference between them is
 * smaller than the difference between funded and not.
 */
function urgency(signal) {
  const base = CATEGORY_WEIGHT[signal.category] ?? 0;
  if (!base) return 0;

  const days = signal.signal_date
    ? (Date.now() - new Date(signal.signal_date).getTime()) / 86_400_000
    : 365;

  // A date in the future is an announcement about a plan, not news: "expanding
  // to Poland by 2034". Math.max(0, days) used to clamp those to zero days old
  // and hand them full recency, so a 2034 plan outranked a round that closed
  // last week. The further out the plan, the less it says about hiring now.
  const recency = days < 0
    ? (days > -90 ? 0.5 : days > -365 ? 0.25 : 0.1)
    : days <= 30 ? 1 : days <= 90 ? 0.85 : days <= 180 ? 0.6 : days <= 365 ? 0.35 : 0.15;

  const conf = signal.confidence ?? 0.7;

  let size = 1;
  if (signal.amount) {
    const m = Number(signal.amount) / 1e6;
    size = m >= 100 ? 1.15 : m >= 25 ? 1.08 : 1;
  }
  if (signal.headcount && Number(signal.headcount) >= 50) size = Math.max(size, 1.12);

  return Math.min(30, Math.round(base * recency * conf * size));
}

async function main() {
  const org = await pool.query("select id from orgs where slug=$1", [ORG_SLUG]);
  if (org.rowCount === 0) throw new Error(`no org with slug ${ORG_SLUG}`);
  const orgId = org.rows[0].id;

  const accounts = await pool.query(
    `select a.id, a.company_name, a.domain, a.work_band, a.final_score, a.priority::text as priority,
            (select count(*) from account_roles r
              where r.account_id=a.id and r.qualified)::int as qualified_roles,
            (select count(*) from people p where p.account_id=a.id)::int as warm_contacts,
            (select count(*) from people p
              where p.account_id=a.id and p.is_decision_maker)::int as decision_makers,
            (select json_agg(json_build_object('title', r.title, 'posted_at', r.posted_at))
               from account_roles r where r.account_id=a.id and r.qualified) as jobs
       from tam_accounts a
      where a.org_id=$1
        and a.domain is not null
        and ($2::text is null or a.work_band = $2)
        and ($2::text is not null or a.work_band in ('now','next'))
      order by case a.work_band when 'now' then 0 when 'next' then 1 else 2 end,
               a.final_score desc nulls last`,
    [orgId, BAND],
  );

  console.log(`${accounts.rowCount} accounts in scope${BAND ? ` (band ${BAND})` : " (now + next)"}`);
  console.log(`Signals since ${SINCE}, confidence at or above ${MIN_CONFIDENCE}`);
  if (!APPLY) console.log("\nPlan only. Rerun with --apply to write.\n");

  let fetched = 0, kept = 0, written = 0, missing = 0, failed = 0;
  const perAccount = [];

  for (const a of accounts.rows) {
    let signals;
    try {
      signals = await companySignals(a.domain, { limit: 100, since: SINCE });
    } catch (err) {
      if (err instanceof PredictLeadsError && err.status === 404) {
        missing += 1;
        console.log(`  ${a.company_name}: no record at ${a.domain}`);
        continue;
      }
      failed += 1;
      console.log(`  ${a.company_name}: ${String(err.message).slice(0, 90)}`);
      continue;
    }

    fetched += signals.length;
    const good = signals.filter((s) => (s.confidence ?? 1) >= MIN_CONFIDENCE);
    kept += good.length;
    if (good.length === 0) continue;

    const top = good.reduce((best, s) => (urgency(s) > urgency(best) ? s : best), good[0]);
    perAccount.push({ name: a.company_name, band: a.work_band, n: good.length, top, score: urgency(top) });

    if (!APPLY) continue;

    for (const s of good) {
      const u = urgency(s);
      // The full six component score, using the same scorer every other signal
      // on this desk goes through. Scoring only urgency would leave the other
      // five null, and a live funding round would then rank below a hand typed
      // workbook row scored out of 100.
      const scored = scoreHeat({
        jobs: a.jobs ?? [],
        priority: a.priority,
        finalScore: a.final_score == null ? null : Number(a.final_score),
        amountUsd: s.amount == null ? null : Number(s.amount),
        roundLabel: s.financing_type,
        warmContacts: a.warm_contacts,
        decisionMakers: a.decision_makers,
        signalDate: s.signal_date,
      });
      const c = scored.components;
      // Conflict on the provider id, so a rerun updates in place. The score is
      // recomputed on every pull because recency decays whether or not the
      // signal changed.
      // signal_key is this table's own natural key and predates the provider
      // id, so both are set: the provider id is what a rerun conflicts on, the
      // signal_key keeps the row consistent with everything imported before.
      await pool.query(
        `insert into heat_signals
           (org_id, signal_key, company_name, norm_name, account_id,
            source, source_event_id, external_id, category, confidence,
            what_happened, detail, signal_date, primary_source, sources,
            amount_usd, headcount, person_name, person_title, location_text,
            hiring_urgency, icp_fit, capital, talent_scarcity, access, freshness,
            heat_score, tam_final_score, heat_vs_tam, breakdown, coverage,
            last_scored, scored_at)
         values ($1,$2,$3,$4,$5,'predictleads',$6,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
                 $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb,$29,
                 now(), now())
         on conflict (org_id, external_id) where external_id is not null
         do update set
           what_happened=excluded.what_happened,
           detail=excluded.detail,
           confidence=excluded.confidence,
           hiring_urgency=excluded.hiring_urgency,
           icp_fit=excluded.icp_fit,
           capital=excluded.capital,
           talent_scarcity=excluded.talent_scarcity,
           access=excluded.access,
           freshness=excluded.freshness,
           heat_score=excluded.heat_score,
           heat_vs_tam=excluded.heat_vs_tam,
           breakdown=excluded.breakdown,
           coverage=excluded.coverage,
           primary_source=excluded.primary_source,
           sources=excluded.sources,
           last_scored=now(),
           scored_at=now()`,
        [
          orgId,
          `predictleads:${s.external_id}`,
          a.company_name,
          normCompany(a.company_name),
          a.id,
          s.external_id,
          s.category, s.confidence,
          describeSignal(s).slice(0, 500),
          s.source_title ? `Reported as: ${s.source_title}` : null,
          s.signal_date, s.source_url,
          JSON.stringify(s.source_url ? [s.source_url] : []),
          s.amount ?? null, s.headcount ?? null, s.contact ?? null,
          s.job_title ?? null, s.location ?? null,
          // Urgency stays ours: the category weighting knows a funding round
          // means hiring, which a job count alone cannot say.
          Math.max(u, c.hiring_urgency ?? 0),
          c.icp_fit, c.capital, c.talent_scarcity, c.access, c.freshness,
          scored.heat_score,
          a.final_score == null ? null : Number(a.final_score),
          a.final_score == null ? null : scored.heat_score - Number(a.final_score),
          JSON.stringify(scored.terms ?? []),
          scored.coverage ?? null,
        ],
      );
      written += 1;
    }
  }

  console.log(`\nfetched ${fetched}, kept ${kept} above confidence, ${missing} companies unknown, ${failed} failed`);
  if (APPLY) console.log(`wrote ${written} signals`);

  perAccount.sort((x, y) => y.score - x.score);
  console.log("\nHottest accounts:");
  for (const r of perAccount.slice(0, 12)) {
    console.log(`  ${String(r.score).padStart(5)}  ${r.band.padEnd(5)} ${r.name}`);
    console.log(`         ${r.top.signal_date ?? "undated"}  ${describeSignal(r.top).slice(0, 88)}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(String(err.message).slice(0, 400));
  await pool.end().catch(() => {});
  process.exit(1);
});
