// Export the working market as one CSV, for enriching elsewhere.
//
//   npm run export                       every account still missing a website
//   npm run export -- --all              all 961, resolved or not
//   npm run export -- --band now         just Work now
//
// Writes to ALAC_DATA_DIR, never into the repo. The file carries real company
// names, so it is client data and the repo is public.
//
// Re-importing is the other half: `npm run import:domains` reads a CSV with a
// record_id and a domain column and writes the domains back, so the round trip
// is closed rather than leaving the enriched file stranded on a desktop.

import { config } from "dotenv";
import pg from "pg";
import { writeFileSync } from "node:fs";

config({ path: ".env.local" });

const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. It points outside this repo, because the export");
  console.error("contains real company names. See .env.example.");
  process.exit(1);
}

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const ALL = process.argv.includes("--all");
const BAND = (() => {
  const i = process.argv.indexOf("--band");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/**
 * One CSV field.
 *
 * Quotes everything rather than only what needs it. A company name containing a
 * comma is common here ("Anduril Industries, Inc."), and the failure mode of
 * getting this wrong is a silently shifted column, which is the same class of
 * bug as the CSV and xlsx parsers in this repo.
 */
const cell = (v) => {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const run = async () => {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  const { rows } = await client.query(
    `select a.record_id, a.company_name, a.linkedin_url, a.domain, a.domain_source,
            a.priority::text as priority, a.final_score, a.work_band, a.work_score,
            a.work_reason, a.next_week, a.prep_status::text as prep_status,
            (select count(*)::int from people p where p.account_id = a.id) as warm_contacts,
            (select count(*)::int from people p
              where p.account_id = a.id and p.is_decision_maker) as decision_makers,
            (select count(*)::int from account_roles r
              where r.account_id = a.id and r.qualified) as open_roles,
            (select max(h.heat_score) from heat_signals h where h.account_id = a.id) as urgency
       from tam_accounts a
      where a.org_id = $1
        and (a.priority in ('priority_1','priority_2','unscored') or a.next_week)
        and ($2::boolean or a.domain is null)
        and ($3::text is null or a.work_band = $3)
      order by a.work_score desc nulls last, a.company_name`,
    [orgId, ALL, BAND],
  );

  // The slug is included because it is the identifier the LinkedIn URL reduces
  // to, and most enrichment tools want one or the other.
  const header = [
    "record_id", "company_name", "linkedin_url", "linkedin_slug", "domain",
    "domain_source", "priority", "fit_score", "band", "rank_score", "reason",
    "next_week", "progress", "warm_contacts", "decision_makers", "open_roles",
    "urgency",
  ];

  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const slug = (r.linkedin_url ?? "").match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1] ?? "";
    lines.push(
      [
        r.record_id, r.company_name, r.linkedin_url, slug, r.domain, r.domain_source,
        r.priority, r.final_score, r.work_band, r.work_score, r.work_reason,
        r.next_week ? "YES" : "NO", r.prep_status, r.warm_contacts,
        r.decision_makers, r.open_roles, r.urgency,
      ].map(cell).join(","),
    );
  }

  const name = ALL
    ? "alac-accounts-all.csv"
    : BAND
      ? `alac-accounts-${BAND}.csv`
      : "alac-accounts-need-domain.csv";
  const path = `${dataDir}/${name}`;
  // BOM so Excel opens it as UTF-8 rather than mangling every accented name.
  writeFileSync(path, `﻿${lines.join("\r\n")}\r\n`, "utf8");

  console.log(`${rows.length} rows written to:`);
  console.log(`  ${path}`);
  console.log("");
  console.log("To load domains back in, keep the record_id column, add or fill");
  console.log("the domain column, then run:");
  console.log(`  npm run import:domains -- "${name}"`);

  await client.end();
};

run().catch(async (err) => {
  console.error(String(err?.message ?? err));
  await client.end().catch(() => {});
  process.exit(1);
});
