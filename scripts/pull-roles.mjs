// Pull open roles from Apify, for the accounts that matter.
//
//   npm run roles                      plan, shows what it would do
//   npm run roles -- --apply           resolve ids and pull roles for Work now
//   npm run roles -- --apply --band next
//   npm run roles -- --apply --limit 5
//
// Why Apify and not Fiber: Fiber bills one credit per posting found, and the
// working market holds tens of thousands of open roles. Astranis alone has 599
// and Anduril 2,697. Apify's job actors run at roughly $0.40 per 1,000 jobs,
// which turns a 24,000 credit pull into about ten dollars.
//
// Two steps, because LinkedIn needs a numeric org id to filter jobs by company
// and this app holds slugs:
//
//   1. slug -> org id, website, headcount        once per company, then stored
//   2. org id -> open roles                      repeatable, cheap
//
// Searching by company NAME instead would avoid step 1 and quietly break the
// result: a keyword search for "Astranis" returns SpaceX, Antares and Array
// Labs alongside it, and those roles would be attributed to the wrong account.

import { config } from "dotenv";
import pg from "pg";
import {
  resolveCompanies, fetchJobsForOrgIds, normalizeJob, redact,
  JOBS_ACTOR, COMPANY_ACTOR,
} from "../src/lib/server/integrations/apify.mjs";

config({ path: ".env.local" });

if (!(process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN)) {
  console.error("APIFY_TOKEN is not set. See .env.example.");
  process.exit(1);
}

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const BAND = (() => {
  const i = process.argv.indexOf("--band");
  return i >= 0 ? process.argv[i + 1] : "now";
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) || 0 : 0;
})();

// One company per actor run for the job pull. A combined run is cheaper in
// wall clock but LinkedIn's f_C filter takes a single id, so combining them
// makes a posting impossible to attribute back to an account.
const ROLES_PER_COMPANY = 25;
// Company resolution batches fine, and batching it is what keeps step 1 quick.
const RESOLVE_BATCH = 10;

/**
 * Is this a role ALAC would be engaged on?
 *
 * Same rule the Fiber path uses, deliberately: two sources feeding one column
 * with different definitions of "qualified" would make the count meaningless.
 */
function qualifyRole(title = "") {
  const t = title.toLowerCase();
  if (/\b(intern|internship|apprentice|student)\b/.test(t)) return false;
  if (/\b(receptionist|office manager|janitor|barista|driver)\b/.test(t)) return false;
  return /\b(engineer|engineering|scientist|architect|developer|technician|program|product|director|vp|vice president|head|chief|principal|staff|lead|manager|recruiter)\b/.test(t);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const run = async () => {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  // Skip accounts pulled recently. Without this a re-run after an interruption
  // starts from the top and pays again for every company it already has, which
  // is exactly what happened the first time this was run against a full band.
  //
  // --refresh forces a re-pull, because roles do go stale and a fortnight old
  // list is not the current hiring picture.
  const REFRESH = process.argv.includes("--refresh");
  const STALE_DAYS = 7;

  const { rows: accounts } = await client.query(
    `select a.id, a.record_id, a.company_name, a.linkedin_url, a.linkedin_org_id,
            a.domain, a.work_band,
            (select max(r.fetched_at) from account_roles r
              where r.account_id = a.id and r.source = 'apify') as roles_fetched_at
       from tam_accounts a
      where a.org_id = $1 and a.work_band = $2 and a.linkedin_url is not null
        and ($3::boolean or not exists (
              select 1 from account_roles r
               where r.account_id = a.id and r.source = 'apify'
                 and r.fetched_at > now() - ($4::int || ' days')::interval))
      order by a.work_score desc nulls last
      ${LIMIT > 0 ? `limit ${LIMIT}` : ""}`,
    [orgId, BAND, REFRESH, STALE_DAYS],
  );

  const { rows: skipped } = await client.query(
    `select count(*)::int as n from tam_accounts a
      where a.org_id = $1 and a.work_band = $2 and exists (
        select 1 from account_roles r
         where r.account_id = a.id and r.source = 'apify'
           and r.fetched_at > now() - ($3::int || ' days')::interval)`,
    [orgId, BAND, STALE_DAYS],
  );
  if (skipped[0].n > 0 && !REFRESH) {
    console.log(`Skipping ${skipped[0].n} pulled in the last ${STALE_DAYS} days. Use --refresh to force.\n`);
  }

  const needId = accounts.filter((a) => !a.linkedin_org_id);
  console.log(`Band "${BAND}": ${accounts.length} accounts`);
  console.log(`  org ids known:   ${accounts.length - needId.length}`);
  console.log(`  need resolving:  ${needId.length}`);
  console.log(`\nactors:`);
  console.log(`  companies  ${COMPANY_ACTOR}`);
  console.log(`  jobs       ${JOBS_ACTOR}`);
  console.log(`\nEstimate: ${needId.length} company lookups, then ${accounts.length} job searches`);
  console.log(`at up to ${ROLES_PER_COMPANY} roles each, so at most ${accounts.length * ROLES_PER_COMPANY} postings.`);
  console.log(`At roughly $0.40 per 1,000 jobs that is about $${((accounts.length * ROLES_PER_COMPANY) / 1000 * 0.4).toFixed(2)}.`);

  if (!APPLY) {
    console.log("\nPlan only. Nothing fetched, nothing spent.");
    console.log(`Rerun with --apply:\n  npm run roles -- --apply --band ${BAND}`);
    await client.end();
    return;
  }

  const runRow = await client.query(
    `insert into agent_runs (org_id, kind, status, trigger, params, started_at)
     values ($1, 'import', 'running', 'manual', $2::jsonb, now()) returning id`,
    [orgId, JSON.stringify({ source: "apify_roles", band: BAND })],
  );
  const runId = runRow.rows[0].id;

  let resolved = 0;
  let rolesWritten = 0;
  let failedAccounts = 0;

  try {
    // ---- step 1: slug -> org id ------------------------------------------
    if (needId.length > 0) {
      console.log(`\nResolving ${needId.length} companies...`);
      for (let i = 0; i < needId.length; i += RESOLVE_BATCH) {
        const batch = needId.slice(i, i + RESOLVE_BATCH);
        const slugs = batch
          .map((a) => a.linkedin_url.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1])
          .filter(Boolean);
        try {
          const found = await resolveCompanies(slugs);
          // Match on slug, not on position: the actor may drop a company it
          // cannot find, and matching by index would then shift every id onto
          // the wrong account.
          const bySlug = new Map(found.map((c) => [String(c.slug ?? "").toLowerCase(), c]));
          for (const a of batch) {
            const slug = a.linkedin_url.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1];
            const c = bySlug.get(String(slug ?? "").toLowerCase());
            if (!c) continue;
            await client.query(
              `update tam_accounts
                  set linkedin_org_id = $2,
                      domain = coalesce(domain, $3),
                      employee_count = coalesce($4, employee_count),
                      enriched_at = now()
                where id = $1`,
              [a.id, c.org_id, c.website ? c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null, c.employee_count],
            );
            a.linkedin_org_id = c.org_id;
            resolved += 1;
          }
        } catch (err) {
          console.log(`  batch at ${i} failed: ${redact(err.message).slice(0, 120)}`);
        }
        process.stdout.write(`\r  ${Math.min(i + RESOLVE_BATCH, needId.length)}/${needId.length}`);
      }
      console.log(`\r  ${resolved} resolved\n`);
    }

    // ---- step 2: org id -> open roles -------------------------------------
    const ready = accounts.filter((a) => a.linkedin_org_id);
    console.log(`Pulling roles for ${ready.length} accounts...`);

    for (const [i, a] of ready.entries()) {
      try {
        const items = await fetchJobsForOrgIds([a.linkedin_org_id], {
          maxPerCompany: ROLES_PER_COMPANY,
        });
        const jobs = items.map(normalizeJob).filter(Boolean);

        for (const j of jobs) {
          await client.query(
            `insert into account_roles (org_id, account_id, external_id, title, url, location,
               seniority, job_function, posted_at, qualified, source, applicants)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'apify',$11)
             on conflict (org_id, account_id, external_id) do update set
               title=excluded.title, url=excluded.url, location=excluded.location,
               seniority=excluded.seniority, job_function=excluded.job_function,
               posted_at=excluded.posted_at, qualified=excluded.qualified,
               applicants=excluded.applicants, source='apify', fetched_at=now()`,
            [
              orgId, a.id, j.external_id, j.title, j.url, j.location,
              j.seniority, j.job_function, j.posted_at, qualifyRole(j.title),
              Number.isFinite(j.applicants) ? j.applicants : null,
            ],
          );
          rolesWritten += 1;
        }
        const q = jobs.filter((j) => qualifyRole(j.title)).length;
        console.log(`  ${String(i + 1).padStart(3)}/${ready.length}  ${a.company_name.slice(0, 32).padEnd(34)}${String(jobs.length).padStart(3)} roles, ${q} relevant`);
      } catch (err) {
        failedAccounts += 1;
        console.log(`  ${String(i + 1).padStart(3)}/${ready.length}  ${a.company_name.slice(0, 32).padEnd(34)}failed: ${redact(err.message).slice(0, 70)}`);
      }
    }

    await client.query(
      `update agent_runs set status=$2, items_total=$3, items_ok=$4, items_failed=$5,
              finished_at=now(), duration_ms=extract(epoch from (now()-started_at))*1000
         where id=$1`,
      [runId, failedAccounts > 0 ? "partial" : "complete", accounts.length,
       accounts.length - failedAccounts, failedAccounts],
    );

    console.log(`\n  ${resolved} companies resolved`);
    console.log(`  ${rolesWritten} roles written`);
    if (failedAccounts > 0) console.log(`  ${failedAccounts} accounts failed`);
    console.log(`\nNext: npm run map    to re-rank with the new role counts`);
  } catch (err) {
    await client
      .query("update agent_runs set status='failed', error=$2, finished_at=now() where id=$1", [
        runId, redact(String(err?.message ?? err)).slice(0, 2000),
      ])
      .catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
};

run().catch((err) => {
  console.error(redact(String(err?.message ?? err)));
  process.exit(1);
});
