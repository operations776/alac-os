#!/usr/bin/env node
// Seeds the accounts that must exist regardless of what the export contained.
//
// Why this script exists: the source export is a scrape, so it misses
// companies that matter most. Verified against the real file:
//   - Saronic and Helsing, both named tier-1 targets, are absent entirely
//   - Anduril, the number one target, is present but shows 0 open roles
//   - 3 of the 4 current-client domains are absent, so suppression silently
//     protected nobody
//
// Left alone, the portfolio would omit the names the operator expects to see,
// and he would stop trusting the ranking in the first thirty seconds. Pinned
// accounts are locked so the engine may not demote them.

import pg from "pg";
import dotenv from "dotenv";
import { normCompany, normDomain } from "../src/lib/server/import/normalize.mjs";

dotenv.config({ path: ".env.local", quiet: true });

const ORG_SLUG = process.env.ALAC_ORG_SLUG || "alac";

// Named tier-1 targets. Pinned to top25 and locked.
const DREAM = [
  ["Anduril Industries", "anduril.com", "Defense Technology"],
  ["Saronic Technologies", "saronic.com", "Autonomous Systems"],
  ["Shield AI", "shield.ai", "Autonomous Systems"],
  ["Overland AI", "overland.ai", "Autonomous Systems"],
  ["Neros Technologies", "neros.com", "Defense Technology"],
  ["Epirus", "epirus.com", "Directed Energy"],
  ["Rebellion Defense", "rebelliondefense.com", "Defense Technology"],
  ["Helsing", "helsing.ai", "Defense Technology"],
  ["True Anomaly", "trueanomaly.space", "Space Technology"],
  ["Intuitive Machines", "intuitivemachines.com", "Space Technology"],
];

// Current clients. Never prospected, but kept visible as farmable accounts.
const CLIENTS = [
  ["Echodyne", "echodyne.com"],
  ["UVision USA", "uvision.co"],
  ["Merlin Labs", "merlinlabs.com"],
  ["Umbra Space", "umbra.space"],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

let exitCode = 0;
try {
  const { rows: orgRows } = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (!orgRows.length) throw new Error(`No org with slug "${ORG_SLUG}". Run the TAM import first.`);
  const orgId = orgRows[0].id;

  let created = 0, pinned = 0;

  for (const [name, domain, vertical] of DREAM) {
    const nd = normDomain(domain);
    const { rows } = await client.query(
      `insert into accounts (org_id, company_name, norm_name, domain, norm_domain, vertical,
                             defense_verdict, tier, tier_locked, source)
       values ($1,$2,$3,$4,$5,$6,'FIT','top25',true,'dream100')
       on conflict (org_id, norm_domain) where norm_domain is not null
       do update set tier = 'top25', tier_locked = true, tier_set_at = now(),
                     defense_verdict = 'FIT', updated_at = now(),
                     -- The export has rows with a blank Company, where the
                     -- importer fell back to the domain as the display name.
                     -- A curated name is better than "saronic.com".
                     company_name = excluded.company_name,
                     norm_name = excluded.norm_name,
                     vertical = coalesce(accounts.vertical, excluded.vertical)
       returning id, (xmax = 0) as inserted`,
      [orgId, name, normCompany(name), domain, nd, vertical],
    );
    if (rows[0].inserted) created++;
    pinned++;

    await client.query(
      `insert into signals (org_id, account_id, kind, headline, occurred_at, source, source_ref)
       values ($1,$2,'news_mention',$3,current_date,'dream100 seed',$4)
       on conflict do nothing`,
      [orgId, rows[0].id, "Named tier-1 target account", `dream100:${nd}`],
    );
  }

  for (const [name, domain] of CLIENTS) {
    const nd = normDomain(domain);
    const { rows } = await client.query(
      `insert into accounts (org_id, company_name, norm_name, domain, norm_domain,
                             defense_verdict, is_suppressed, suppression_reason,
                             on_existing_list, source)
       values ($1,$2,$3,$4,$5,'FIT',true,'Current client, never prospect',true,'client seed')
       on conflict (org_id, norm_domain) where norm_domain is not null
       do update set is_suppressed = true,
                     suppression_reason = 'Current client, never prospect',
                     on_existing_list = true, updated_at = now()
       returning id, (xmax = 0) as inserted`,
      [orgId, name, normCompany(name), domain, nd],
    );
    if (rows[0].inserted) created++;

    await client.query(
      `insert into signals (org_id, account_id, kind, headline, occurred_at, source, source_ref)
       values ($1,$2,'existing_relationship',$3,current_date,'client seed',$4)
       on conflict do nothing`,
      [orgId, rows[0].id, "Current client relationship", `client:${nd}`],
    );
  }

  // Re-apply suppression now that the client accounts certainly exist.
  const flagged = await client.query(
    `update accounts a set is_suppressed = true, suppression_reason = s.reason
       from suppressions s
      where s.org_id = a.org_id and s.active and a.org_id = $1
        and (a.norm_domain = s.norm_domain or a.norm_name = s.norm_company)
        and a.is_suppressed = false
      returning a.id`,
    [orgId],
  );

  console.log(`Dream targets pinned: ${pinned}`);
  console.log(`Accounts created:     ${created}`);
  console.log(`Newly suppressed:     ${flagged.rowCount}`);
} catch (error) {
  console.error(`Seed failed: ${error.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
