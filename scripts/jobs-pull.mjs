// Live open roles for the accounts being worked.
//
//   npm run jobs                  plan, shows what it would pull
//   npm run jobs -- --apply       pull and write
//   npm run jobs -- --apply --band now
//   npm run jobs -- --today       what appeared in the last 24 hours
//
// The desk question this answers is "what can I call about today". A role that
// went up this morning is a reason to contact somebody this morning, and by
// next week it is one of forty and no longer a reason for anything.

import { config } from "dotenv";
import pg from "pg";
import {
  companyJobs,
  qualifyRole,
  predictLeadsAvailable,
  PredictLeadsError,
} from "../src/lib/server/integrations/predictleads.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const TODAY_ONLY = process.argv.includes("--today");
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BAND = arg("--band", null);
const PER_COMPANY = Number(arg("--limit", "100"));

if (!predictLeadsAvailable()) {
  console.error("PREDICTLEADS_API_KEY and PREDICTLEADS_API_TOKEN must both be set.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  max: 4,
});

const daysAgo = (d) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null;

/**
 * How strong an opening one role is, out of 100.
 *
 * Freshness dominates on purpose. Every other factor describes the role, and
 * this one describes the opportunity: a director level opening posted today is
 * worth more as an approach than a better matched one posted six weeks ago
 * that four agencies have already called about.
 */
function roleScore(r) {
  const age = daysAgo(r.first_seen);
  const fresh = age === null ? 20 : age <= 1 ? 45 : age <= 3 ? 38 : age <= 7 ? 30 : age <= 14 ? 22 : age <= 30 ? 14 : 6;

  const t = String(r.title ?? "").toLowerCase();
  let seniority = 10;
  if (/chief|vp|vice president|head of/.test(t)) seniority = 25;
  else if (/director|principal|staff/.test(t)) seniority = 22;
  else if (/senior|sr\.|lead/.test(t)) seniority = 18;
  else if (/manager/.test(t)) seniority = 15;

  // The disciplines ALAC actually places into. A role outside them is real
  // hiring but not their hiring.
  let fit = 6;
  if (/engineer|engineering|scientist|architect|technician/.test(t)) fit = 20;
  else if (/program|product|manufacturing|operations|quality/.test(t)) fit = 16;
  else if (/security|clearance|classified/.test(t)) fit = 18;

  // A published band means a candidate conversation can start without a
  // salary discovery call, which makes the role easier to work.
  const paid = r.salary ? 10 : 0;

  return Math.min(100, fresh + seniority + fit + paid);
}

async function main() {
  const org = await pool.query("select id from orgs where slug=$1", [ORG_SLUG]);
  if (org.rowCount === 0) throw new Error(`no org with slug ${ORG_SLUG}`);
  const orgId = org.rows[0].id;

  const accounts = await pool.query(
    `select id, company_name, domain, work_band
       from tam_accounts
      where org_id=$1 and domain is not null
        and ($2::text is null or work_band = $2)
        and ($2::text is not null or work_band in ('now','next'))
      order by case work_band when 'now' then 0 else 1 end, company_name`,
    [orgId, BAND],
  );

  console.log(`${accounts.rowCount} accounts${BAND ? ` (band ${BAND})` : " (now + next)"}`);
  if (!APPLY) console.log("Plan only. Rerun with --apply to write.\n");

  let pulled = 0, qualified = 0, written = 0, missing = 0;
  const fresh = [];

  for (const a of accounts.rows) {
    let roles;
    try {
      roles = await companyJobs(a.domain, { limit: PER_COMPANY });
    } catch (err) {
      if (err instanceof PredictLeadsError && err.status === 404) {
        missing += 1;
        continue;
      }
      console.log(`  ${a.company_name}: ${String(err.message).slice(0, 80)}`);
      continue;
    }

    pulled += roles.length;

    for (const r of roles) {
      if (!r.title) continue;
      const ok = qualifyRole(r.title);
      if (ok) qualified += 1;

      const age = daysAgo(r.first_seen);
      if (ok && age !== null && age <= 7) {
        fresh.push({ ...r, company: a.company_name, band: a.work_band, score: roleScore(r), age });
      }

      if (!APPLY) continue;

      await pool.query(
        `insert into account_roles
           (org_id, account_id, external_id, title, url, location, seniority,
            job_function, posted_at, qualified, source, salary_text, occupation,
            contract, first_seen, last_seen, fetched_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'predictleads',$11,$12,$13,$14,$15,now())
         on conflict (org_id, account_id, external_id) do update set
           title=excluded.title, url=excluded.url, location=excluded.location,
           seniority=excluded.seniority, qualified=excluded.qualified,
           salary_text=excluded.salary_text, occupation=excluded.occupation,
           last_seen=excluded.last_seen, fetched_at=now()`,
        [
          orgId, a.id, r.external_id, r.title, r.url, r.location, r.seniority,
          r.categories?.[0] ?? null, r.first_seen, ok,
          r.salary, r.occupation, r.contract, r.first_seen, r.last_seen,
        ],
      );
      written += 1;
    }
  }

  console.log(`\npulled ${pulled} postings, ${qualified} qualified, ${missing} companies unknown`);
  if (APPLY) console.log(`wrote ${written}`);

  fresh.sort((x, y) => y.score - x.score);
  const show = TODAY_ONLY ? fresh.filter((r) => r.age <= 1) : fresh;

  console.log(`\n${show.length} qualified roles posted in the last ${TODAY_ONLY ? "24 hours" : "7 days"}\n`);
  for (const r of show.slice(0, 25)) {
    const when = r.age === 0 ? "today" : r.age === 1 ? "yesterday" : `${r.age}d ago`;
    console.log(`  ${String(r.score).padStart(3)}  ${r.company}`);
    console.log(`       ${r.title}`);
    console.log(`       ${when}${r.location ? `, ${r.location}` : ""}${r.salary ? `, ${r.salary}` : ""}`);
    if (r.url) console.log(`       ${r.url}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(String(err.message).slice(0, 400));
  await pool.end().catch(() => {});
  process.exit(1);
});
