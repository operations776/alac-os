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
    ? Math.max(0, (Date.now() - new Date(signal.signal_date).getTime()) / 86_400_000)
    : 365;
  const recency = days <= 30 ? 1 : days <= 90 ? 0.85 : days <= 180 ? 0.6 : days <= 365 ? 0.35 : 0.15;

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
    `select id, company_name, domain, work_band, final_score
       from tam_accounts
      where org_id=$1
        and domain is not null
        and ($2::text is null or work_band = $2)
        and ($2::text is not null or work_band in ('now','next'))
      order by case work_band when 'now' then 0 when 'next' then 1 else 2 end,
               final_score desc nulls last`,
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
            hiring_urgency, heat_score, last_scored, scored_at)
         values ($1,$2,$3,$4,$5,'predictleads',$6,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,
                 $14,$15,$16,$17,$18,$19,$20, now(), now())
         on conflict (org_id, external_id) where external_id is not null
         do update set
           what_happened=excluded.what_happened,
           detail=excluded.detail,
           confidence=excluded.confidence,
           hiring_urgency=excluded.hiring_urgency,
           heat_score=excluded.heat_score,
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
          u, u,
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
