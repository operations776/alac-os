#!/usr/bin/env node
// Imports the account universe and emits the signals derived from it.
//
// Idempotent: re-running upserts on norm_domain and the signal unique index
// swallows duplicates, so it is safe to run twice. Data law 2.

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";
import {
  parseCsvObjects, normDomain, normCompany, parseMoney,
  parseBandMidpoint, parseState, parseDate, splitTags,
} from "../src/lib/server/import/normalize.mjs";

dotenv.config({ path: ".env.local", quiet: true });

const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. It points at the client workspace holding the real CSVs,");
  console.error("which are deliberately outside this public repo. See .env.example.");
  process.exit(1);
}

const file = path.join(dataDir, "data", "ALAC-TAM-FINAL.csv");
const ORG_SLUG = process.env.ALAC_ORG_SLUG || "alac";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

let exitCode = 0;
try {
  // The org is the tenant every row hangs off.
  const { rows: orgRows } = await client.query(
    `insert into orgs (name, slug) values ($1, $2)
     on conflict (slug) do update set name = excluded.name
     returning id`,
    ["ALAC HR Solutions", ORG_SLUG],
  );
  const orgId = orgRows[0].id;

  const rows = parseCsvObjects(readFileSync(file, "utf8"));

  // A short parse means the quote-aware reader broke on embedded newlines,
  // which would silently import a third of the file. Fail loudly instead.
  if (rows.length < 8000) {
    throw new Error(
      `Parsed only ${rows.length} records. Expected about 8,298. ` +
      `This means the CSV parser broke on embedded newlines. Refusing to import a partial universe.`,
    );
  }
  console.log(`Parsed ${rows.length} companies from ${path.basename(file)}`);

  const run = await client.query(
    `insert into agent_runs (org_id, kind, trigger, params, items_total)
     values ($1, 'import', 'manual', $2, $3) returning id`,
    [orgId, JSON.stringify({ file: path.basename(file) }), rows.length],
  );
  const runId = run.rows[0].id;

  let ok = 0, failed = 0, signalCount = 0;
  const CHUNK = 250;
  const today = new Date().toISOString().slice(0, 10);

  // One multi-row statement per chunk, not one per row. A round trip per row
  // over a network connection is roughly a hundred times slower and turns a
  // one minute import into an hour.
  const COLS = 25;

  // Rows that carry a domain and rows that do not hit different partial unique
  // indexes, so they need separate conflict targets and therefore separate
  // statements.
  const prepared = [];
  for (const r of rows) {
    const domain = normDomain(r.Domain);
    // normCompany strips punctuation and non-Latin scripts, so a handful of
    // rows normalize to nothing even though Company was non-empty. 86 more
    // rows have no Company at all. In both cases the domain is the identity,
    // and the display name falls back to it rather than dropping the row.
    const normName = normCompany(r.Company) || domain;
    const displayName = r.Company?.trim() || domain;
    if (!normName && !domain) { failed++; continue; }
    const verdictRaw = (r.Defense_Verdict || "").toUpperCase();
    prepared.push({
      domain,
      normName,
      fundingDate: parseDate(r.Last_Funding_Date),
      openRoles: parseInt(r.Open_Roles_Count, 10) || 0,
      onList: (r.On_Existing_List || "").toUpperCase() === "Y",
      fundingAmountRaw: r.Last_Funding_Amount || "",
      fundingStage: r.Funding_Stage || "",
      values: [
        orgId, displayName, normName, r.Domain || null, domain,
        r.LinkedIn_URL || null, r.Vertical || null, r.Employee_Band || null,
        parseBandMidpoint(r.Employee_Band), r.HQ_Location || null, parseState(r.HQ_Location),
        parseInt(r.Founded_Year, 10) || null, r.Funding_Stage || null, parseDate(r.Last_Funding_Date),
        parseMoney(r.Last_Funding_Amount), parseMoney(r.Total_Funding),
        parseInt(r.Open_Roles_Count, 10) || 0,
        r.Defense_Alignment || null, ["FIT", "MAYBE", "NO"].includes(verdictRaw) ? verdictRaw : null,
        parseInt(r.Priority_Score, 10) || null,
        (r.On_Existing_List || "").toUpperCase() === "Y", r.NAICS || null,
        splitTags(r.Keyword_Tags), r.Description || null, r.Source || null,
      ],
    });
  }

  // Postgres refuses a multi-row upsert that targets the same key twice
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"). The
  // export contains 26 rows sharing a domain, so collapse to the last
  // occurrence per key before building the statement.
  function dedupe(list, keyOf) {
    const byKey = new Map();
    for (const item of list) byKey.set(keyOf(item), item);
    return [...byKey.values()];
  }

  const withDomain = dedupe(prepared.filter((p) => p.domain), (p) => p.domain);
  const withoutDomain = dedupe(prepared.filter((p) => !p.domain), (p) => p.normName);
  const collapsed = prepared.length - withDomain.length - withoutDomain.length;
  if (collapsed > 0) console.log(`Collapsed ${collapsed} duplicate identities before insert`);

  async function insertGroup(group, conflictTarget) {
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK);
      try {
        await client.query("begin");

        const params = [];
        const tuples = chunk.map((p, n) => {
          params.push(...p.values);
          const base = n * COLS;
          return `(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(",")})`;
        });

        const { rows: inserted } = await client.query(
          `insert into accounts (
             org_id, company_name, norm_name, domain, norm_domain, linkedin_url,
             vertical, employee_band, employee_midpoint, hq_location, hq_state,
             founded_year, funding_stage, last_funding_date,
             last_funding_amount_usd, total_funding_usd, open_roles_count,
             defense_alignment, defense_verdict, source_priority_score,
             on_existing_list, naics, keyword_tags, description, source
           ) values ${tuples.join(",")}
           on conflict ${conflictTarget} do update set
             company_name = excluded.company_name,
             open_roles_count = excluded.open_roles_count,
             last_funding_date = excluded.last_funding_date,
             last_funding_amount_usd = excluded.last_funding_amount_usd,
             total_funding_usd = excluded.total_funding_usd,
             defense_verdict = excluded.defense_verdict,
             source_priority_score = excluded.source_priority_score,
             updated_at = now()
           returning id, norm_domain, norm_name`,
          params,
        );
        ok += inserted.length;

        // Map returned ids back to their source rows so signals attach to the
        // right account. A chunk can contain two rows sharing a domain, in
        // which case the upsert collapses them and returns fewer rows.
        const byKey = new Map();
        for (const row of inserted) byKey.set(row.norm_domain || row.norm_name, row.id);

        const sigParams = [];
        const sigTuples = [];
        const pushSignal = (accountId, kind, headline, magnitude, occurred, ref) => {
          const base = sigParams.length;
          sigParams.push(orgId, accountId, kind, headline, magnitude, occurred, "ALAC-TAM-FINAL.csv", ref);
          sigTuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`);
        };

        for (const p of chunk) {
          const accountId = byKey.get(p.domain || p.normName);
          if (!accountId) continue;
          const key = p.domain || p.normName;
          if (p.fundingDate) {
            pushSignal(accountId, "funding_round",
              `Raised ${p.fundingAmountRaw || "a round"}${p.fundingStage ? ` (${p.fundingStage})` : ""}`,
              parseMoney(p.fundingAmountRaw), p.fundingDate, `funding_round:${key}`);
          }
          if (p.openRoles > 0) {
            pushSignal(accountId, "hiring_volume",
              `${p.openRoles} open role${p.openRoles === 1 ? "" : "s"}`,
              p.openRoles, today, `hiring_volume:${key}`);
          }
          if (p.onList) {
            pushSignal(accountId, "existing_relationship",
              "On the existing relationship list", null, today, `existing_relationship:${key}`);
          }
        }

        if (sigTuples.length) {
          const res = await client.query(
            `insert into signals (org_id, account_id, kind, headline, magnitude, occurred_at, source, source_ref)
             values ${sigTuples.join(",")}
             on conflict do nothing`,
            sigParams,
          );
          signalCount += res.rowCount;
        }

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        failed += chunk.length;
        console.error(`  chunk at ${i} failed: ${error.message}`);
      }
      process.stdout.write(`  ${Math.min(i + CHUNK, group.length)}/${group.length}\r`);
    }
  }

  await insertGroup(withDomain, "(org_id, norm_domain) where norm_domain is not null");
  await insertGroup(withoutDomain, "(org_id, norm_name) where norm_domain is null");

  // Suppression: existing clients stay visible as farmable accounts but are
  // blocked from cold outreach, so this flags rather than deletes.
  const suppressed = [
    ["echodyne.com", "Echodyne"], ["uvision.co", "UVision USA"],
    ["merlinlabs.com", "Merlin Labs"], ["umbra.space", "Umbra Space"],
  ];
  for (const [domain, name] of suppressed) {
    await client.query(
      `insert into suppressions (org_id, scope, norm_domain, norm_company, reason)
       values ($1, 'client', $2, $3, 'Current client, never prospect')
       on conflict do nothing`,
      [orgId, domain, normCompany(name)],
    );
  }
  const flagged = await client.query(
    `update accounts a set is_suppressed = true,
            suppression_reason = s.reason
       from suppressions s
      where s.org_id = a.org_id and s.active
        and (a.norm_domain = s.norm_domain or a.norm_name = s.norm_company)
        and a.org_id = $1
      returning a.id`,
    [orgId],
  );

  await client.query(
    `update agent_runs set status = $1, items_ok = $2, items_failed = $3,
            finished_at = now(), duration_ms = extract(epoch from (now() - started_at)) * 1000
      where id = $4`,
    [failed > 0 ? "partial" : "complete", ok, failed, runId],
  );

  console.log(`\nAccounts upserted: ${ok}`);
  console.log(`Signals created:   ${signalCount}`);
  console.log(`Suppressed:        ${flagged.rowCount}`);
  if (failed) console.log(`Failed rows:       ${failed}`);
} catch (error) {
  console.error(`\nImport failed: ${error.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
