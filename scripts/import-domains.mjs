// Load enriched domains back in from a CSV.
//
//   npm run import:domains -- "alac-accounts-need-domain.csv"
//   npm run import:domains -- "myfile.csv" --dry
//
// Closes the round trip started by `npm run export`. The file is read from
// ALAC_DATA_DIR, so an enriched spreadsheet never has to enter this repo.
//
// It needs two columns, `record_id` and `domain`. Everything else in the file
// is ignored, so the sheet can carry whatever extra columns the enrichment tool
// added without breaking anything.

import { config } from "dotenv";
import pg from "pg";
import { readFileSync } from "node:fs";
import { parseCsv, cleanDomain } from "../src/lib/server/import/normalize.mjs";

config({ path: ".env.local" });

const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. See .env.example.");
  process.exit(1);
}

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const DRY = process.argv.includes("--dry");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error('Name the file, e.g.  npm run import:domains -- "alac-accounts-need-domain.csv"');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const run = async () => {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  const path = `${dataDir}/${file}`;
  // Strip the BOM the export writes for Excel, or the first header name comes
  // back with an invisible character glued to it and never matches.
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("File has no data rows.");

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idCol = header.indexOf("record_id");
  const domainCol = header.indexOf("domain");
  if (idCol < 0 || domainCol < 0) {
    console.error(`Needs a record_id and a domain column. Found: ${header.join(", ")}`);
    process.exit(1);
  }

  let withDomain = 0;
  let rejected = 0;
  const updates = [];
  for (const row of rows.slice(1)) {
    const recordId = String(row[idCol] ?? "").trim();
    if (!recordId) continue;
    const raw = row[domainCol];
    const domain = cleanDomain(raw);
    if (!domain) {
      if (raw && String(raw).trim()) rejected += 1;
      continue;
    }
    withDomain += 1;
    updates.push([recordId, domain]);
  }

  console.log(`File:     ${path}`);
  console.log(`Rows:     ${rows.length - 1}`);
  console.log(`Domains:  ${withDomain} usable, ${rejected} rejected as not a domain`);

  if (DRY) {
    console.log("\nDry run, nothing written. First 10:");
    for (const [id, d] of updates.slice(0, 10)) console.log(`  ${id.padEnd(14)}${d}`);
    await client.end();
    return;
  }

  // Chunked, for the same reason every other writer here is: one statement per
  // row against a remote database is hundreds of round trips.
  let written = 0;
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const params = [orgId];
    const values = slice.map(([id, d]) => {
      params.push(id, d);
      const n = params.length;
      return `($${n - 1}::text, $${n}::text)`;
    });
    const res = await client.query(
      `update tam_accounts a
          set domain = v.domain, domain_source = 'manual', enriched_at = now()
         from (values ${values.join(",")}) as v(record_id, domain)
        where a.org_id = $1 and a.record_id = v.record_id
          -- Never overwrite a domain Prospeo resolved with one from a sheet.
          -- A resolved value came from the company's own LinkedIn record; a
          -- sheet value came from whatever the operator pasted in.
          and (a.domain is null or a.domain_source <> 'prospeo')`,
      params,
    );
    written += res.rowCount;
  }

  const after = await client.query(
    `select count(*) filter (where domain is not null)::int as with_domain,
            count(*)::int as total
       from tam_accounts
      where org_id = $1 and (priority in ('priority_1','priority_2','unscored') or next_week)`,
    [orgId],
  );

  console.log(`Written:  ${written}`);
  console.log(`Coverage: ${after.rows[0].with_domain} of ${after.rows[0].total} accounts now have a website`);
  console.log("\nNext: npm run map    to re-rank with the new data");

  await client.end();
};

run().catch(async (err) => {
  console.error(String(err?.message ?? err));
  await client.end().catch(() => {});
  process.exit(1);
});
