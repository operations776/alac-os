#!/usr/bin/env node
// Imports the warm contact list and matches each person to an account.
//
// This is the relationship layer. Under 3 percent of these contacts have an
// email address but all are LinkedIn reachable, which is why LinkedIn URL is
// the person key and why drafting defaults to LinkedIn rather than email.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";
import {
  parseCsvObjects, normCompany, parseDate, seniorityOf, isDecisionMaker,
} from "../src/lib/server/import/normalize.mjs";

dotenv.config({ path: ".env.local", quiet: true });

const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. See .env.example.");
  process.exit(1);
}

const ORG_SLUG = process.env.ALAC_ORG_SLUG || "alac";
const file = path.join(dataDir, "outputs", "connections", "adrian-buyer-icp-priority.csv");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

let exitCode = 0;
try {
  const { rows: orgRows } = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (!orgRows.length) throw new Error(`No org with slug "${ORG_SLUG}". Run the TAM import first.`);
  const orgId = orgRows[0].id;

  const rows = parseCsvObjects(readFileSync(file, "utf8"));
  console.log(`Parsed ${rows.length} contacts from ${path.basename(file)}`);

  // Load account identities once. 8k rows is small, and matching in memory
  // avoids a query per contact.
  const { rows: accounts } = await client.query(
    "select id, norm_name, norm_domain from accounts where org_id = $1",
    [orgId],
  );
  const byName = new Map();
  const byDomainRoot = new Map();
  for (const a of accounts) {
    if (a.norm_name && !byName.has(a.norm_name)) byName.set(a.norm_name, a.id);
    if (a.norm_domain) {
      const root = a.norm_domain.split(".")[0];
      if (root && !byDomainRoot.has(root)) byDomainRoot.set(root, a.id);
    }
  }

  const prepared = [];
  const unmatched = [];
  for (const r of rows) {
    const linkedin = (r["LinkedIn URL"] || "").trim() || null;
    const fullName = (r["Full Name"] || "").trim();
    if (!fullName) continue;

    const companyText = (r.Company || "").trim();
    const normCo = normCompany(companyText);

    // Exact name, then domain root. Trigram matching is deliberately not used
    // here: a wrong match attaches a real relationship to the wrong company,
    // which is worse than leaving it unmatched for review.
    let accountId = normCo ? byName.get(normCo) ?? null : null;
    if (!accountId && normCo) {
      const firstWord = normCo.split(" ")[0];
      if (firstWord && firstWord.length > 3) accountId = byDomainRoot.get(firstWord) ?? null;
    }
    if (!accountId && companyText) unmatched.push({ name: fullName, company: companyText });

    const title = (r.Title || "").trim();
    prepared.push({
      linkedin, fullName, title, companyText, normCo, accountId,
      email: (r.Email || "").trim() || null,
      connectedOn: parseDate(r["Connected On"]),
      icpFlag: (r.ICP_Company || "").toUpperCase() === "Y",
      seniority: seniorityOf(title),
      decisionMaker: isDecisionMaker(title),
    });
  }

  // Collapse duplicate keys inside the batch: Postgres rejects an upsert that
  // hits the same key twice in one statement.
  const seen = new Set();
  const deduped = prepared.filter((p) => {
    const key = p.linkedin ? `li:${p.linkedin.toLowerCase()}` : `nc:${p.fullName.toLowerCase()}|${p.normCo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withLinkedin = deduped.filter((p) => p.linkedin);
  const withoutLinkedin = deduped.filter((p) => !p.linkedin);

  const COLS = 14;
  let inserted = 0, matched = 0, signalCount = 0;

  async function insertGroup(group, conflictTarget) {
    const CHUNK = 250;
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK);
      await client.query("begin");
      try {
        const params = [];
        const tuples = chunk.map((p, n) => {
          params.push(
            orgId, p.accountId, p.fullName, p.title || null, p.companyText || null,
            p.normCo, p.linkedin, p.email, "buyer", true, p.connectedOn, p.icpFlag,
            p.seniority, p.decisionMaker,
          );
          const base = n * COLS;
          return `(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(",")})`;
        });

        const { rows: out } = await client.query(
          `insert into people (
             org_id, account_id, full_name, title, company_text, norm_company,
             linkedin_url, email, segment, is_first_degree, connected_on, icp_company_flag,
             seniority, is_decision_maker
           ) values ${tuples.join(",")}
           on conflict ${conflictTarget} do update set
             account_id = coalesce(excluded.account_id, people.account_id),
             title = excluded.title,
             connected_on = excluded.connected_on,
             seniority = excluded.seniority,
             is_decision_maker = excluded.is_decision_maker,
             updated_at = now()
           returning id, account_id`,
          params,
        );
        inserted += out.length;

        // A warm first-degree connection at an account is a scoring input, so
        // it gets a dated signal like any other fact.
        const sigParams = [];
        const sigTuples = [];
        for (const row of out) {
          if (!row.account_id) continue;
          matched++;
          const base = sigParams.length;
          sigParams.push(orgId, row.account_id, row.id, "warm_connection",
            "First degree connection at this account",
            new Date().toISOString().slice(0, 10), "linkedin-export", `warm:${row.id}`);
          sigTuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`);
        }
        if (sigTuples.length) {
          const res = await client.query(
            `insert into signals (org_id, account_id, person_id, kind, headline, occurred_at, source, source_ref)
             values ${sigTuples.join(",")} on conflict do nothing`,
            sigParams,
          );
          signalCount += res.rowCount;
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        console.error(`  chunk at ${i} failed: ${error.message}`);
      }
    }
  }

  await insertGroup(withLinkedin, "(org_id, lower(linkedin_url)) where linkedin_url is not null");
  await insertGroup(withoutLinkedin, "(org_id, lower(full_name), norm_company) where linkedin_url is null");

  // Update the rollup used by the relationship component of the score.
  await client.query(
    `update accounts a
        set warm_contact_count = c.n
       from (select account_id, count(*)::int n from people
              where org_id = $1 and account_id is not null group by account_id) c
      where a.id = c.account_id and a.org_id = $1`,
    [orgId],
  );

  // Unmatched contacts are reported, never auto-created as accounts: a
  // name-only account would duplicate a TAM company under a different spelling.
  if (unmatched.length) {
    const out = path.join(process.cwd(), "unmatched-companies.csv");
    writeFileSync(out, "name,company\n" + unmatched.map((u) => `"${u.name}","${u.company}"`).join("\n"));
    console.log(`Unmatched contacts written to ${path.basename(out)} for review (gitignored)`);
  }

  const { rows: withWarm } = await client.query(
    "select count(*)::int n from accounts where org_id = $1 and warm_contact_count > 0",
    [orgId],
  );

  console.log(`Contacts upserted:        ${inserted}`);
  console.log(`Matched to an account:    ${matched}`);
  console.log(`Accounts with a contact:  ${withWarm[0].n}`);
  console.log(`Warm signals created:     ${signalCount}`);
  console.log(`Unmatched for review:     ${unmatched.length}`);
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
