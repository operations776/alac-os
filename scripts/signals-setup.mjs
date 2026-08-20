// Create (or reuse) the Fiber tracker list that watches the account queue.
//
//   npm run signals:setup            plan only, shows what it would do
//   npm run signals:setup -- --apply create the list and add companies
//   npm run signals:setup -- --apply --dummy   dummy rules, for integration test
//
// Fiber's operating rules are followed here rather than paraphrased: creating a
// list is free, adding entities may charge, so nothing chargeable happens
// without --apply and the credit balance is shown before it does.
//
// Rerunnable. The list is recorded in signal_watchlists, so a second run finds
// the existing list instead of creating a duplicate.

import { config } from "dotenv";
import pg from "pg";
import {
  getOrgCredits, listTrackerCompanyLists, linkedinSlug, redact, FiberError,
} from "../src/lib/server/integrations/fiber.mjs";

config({ path: ".env.local" });

const key = process.env.FIBER_API_KEY;
if (!key) {
  console.error("FIBER_API_KEY is not set. See .env.example.");
  process.exit(1);
}
const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const APPLY = process.argv.includes("--apply");
const DUMMY = process.argv.includes("--dummy");
const LIST_NAME = DUMMY ? "ALAC desk, integration test" : "ALAC account queue";

// Fiber caps how many entities one request may carry. Chunked well under any
// plausible limit, and it also keeps a failure from losing the whole batch.
const CHUNK = 100;

/**
 * What the desk watches for.
 *
 * Each rule is here because it changes hiring timing, which is the only reason
 * this desk contacts anyone. The thresholds are deliberately loose: the heat
 * scorer decides what matters, so the tracker's job is recall, not precision.
 * Filtering hard here would throw away signals before they can be scored.
 */
const RULES = [
  { type: "new_funding_round", entityType: "company", minAmountUsd: 1_000_000 },
  { type: "funding_stage_changed", entityType: "company" },
  { type: "new_investor", entityType: "company" },
  { type: "company_news", entityType: "company" },
  { type: "headcount_growth_percent", entityType: "company", minPercentChange: 15, direction: "grew" },
  { type: "department_size_threshold", entityType: "company", department: "Engineering", threshold: 20, direction: "above" },
  { type: "recently_hired_with_title", entityType: "company", titleKeywords: ["VP", "Chief", "Head of", "Director"] },
  { type: "company_status_changed", entityType: "company", toStatuses: ["acquired", "ipo"] },
  { type: "acquired_company", entityType: "company" },
  { type: "new_office_location", entityType: "company" },
  { type: "recent_layoffs", entityType: "company" },
].map((r) => (DUMMY ? { ...r, isDummy: true } : r));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const post = async (path, body) => {
  const res = await fetch(`https://api.fiber.ai${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ apiKey: key, ...body }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new FiberError(redact(json?.message ?? `HTTP ${res.status}`, key), { status: res.status, body: json });
  }
  return json;
};

const put = async (path, body) => {
  const res = await fetch(`https://api.fiber.ai${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ apiKey: key, ...body }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new FiberError(redact(json?.message ?? `HTTP ${res.status}`, key), { status: res.status, body: json });
  }
  return json;
};

const run = async () => {
  await client.connect();

  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  // The accounts worth watching. Priority 3 is the long tail: 2,072 companies
  // the desk is not working, and watching them would spend the entity budget
  // on rows nobody reads. Priority 1 and 2 plus the strategic exceptions is
  // the actual working set.
  const { rows: accounts } = await client.query(
    `select record_id, company_name, linkedin_url, priority::text as priority
       from tam_accounts
      where org_id = $1
        and linkedin_url is not null
        and (priority in ('priority_1','priority_2','unscored') or next_week)
      order by priority, final_score desc nulls last`,
    [orgId],
  );

  const withSlug = accounts
    .map((a) => ({ ...a, slug: linkedinSlug(a.linkedin_url) }))
    .filter((a) => a.slug);

  console.log(`Accounts in scope:      ${accounts.length}`);
  console.log(`With a usable slug:     ${withSlug.length}`);
  console.log(`Rules on the list:      ${RULES.length}${DUMMY ? " (dummy)" : ""}`);

  const credits = await getOrgCredits(key);
  const bal = Array.isArray(credits?.output) ? credits.output[0] : credits?.output;
  console.log(`Credits available:      ${bal?.available ?? "unknown"} of ${bal?.max ?? "?"}`);

  // Reuse before create. Check our own table first, then Fiber's, so a list
  // created by an earlier run is never duplicated.
  const existing = await client.query(
    "select external_id, name, entity_count from signal_watchlists where org_id = $1 and provider = 'fiber' and name = $2",
    [orgId, LIST_NAME],
  );
  let listId = existing.rows[0]?.external_id ?? null;

  if (!listId) {
    const remote = await listTrackerCompanyLists(key);
    const lists = remote?.output?.lists ?? remote?.output ?? [];
    const match = Array.isArray(lists) ? lists.find((l) => l.name === LIST_NAME) : null;
    if (match) listId = match.id ?? match.listId ?? null;
  }

  console.log(`Existing list:          ${listId ?? "none, would create"}`);

  if (!APPLY) {
    console.log("\nPlan only. Nothing was created and no credits were spent.");
    console.log("Rerun with --apply to create the list and add companies.");
    console.log(`  npm run signals:setup -- --apply${DUMMY ? " --dummy" : ""}`);
    await client.end();
    return;
  }

  if (!listId) {
    console.log("\nCreating the tracker list (free)...");
    const created = await post("/v1/tracker/company-lists", {
      name: LIST_NAME,
      refreshIntervalDays: 7,
      trackingRules: RULES,
    });
    listId = created?.output?.id ?? created?.output?.listId ?? created?.id;
    if (!listId) throw new Error(`List created but no id returned: ${JSON.stringify(created).slice(0, 300)}`);
    console.log(`  list id: ${listId}`);
  }

  await client.query(
    `insert into signal_watchlists (org_id, provider, external_id, name, entity_type, rules, entity_count)
     values ($1, 'fiber', $2, $3, 'company', $4::jsonb, $5)
     on conflict (org_id, provider, external_id) do update set
       name = excluded.name, rules = excluded.rules, entity_count = excluded.entity_count`,
    [orgId, listId, LIST_NAME, JSON.stringify(RULES), withSlug.length],
  );

  // A dummy list needs no real companies: fire-dummy auto-adds an example
  // entity, and adding three thousand real ones would spend for nothing.
  if (DUMMY) {
    console.log("\nDummy list ready. Fire test signals with:");
    console.log(`  npm run signals:pull -- --dummy`);
    await client.end();
    return;
  }

  console.log(`\nAdding ${withSlug.length} companies in chunks of ${CHUNK}...`);
  let added = 0;
  let failed = 0;
  for (let i = 0; i < withSlug.length; i += CHUNK) {
    const chunk = withSlug.slice(i, i + CHUNK);
    try {
      await put(`/v1/tracker/company-lists/${encodeURIComponent(listId)}/companies`, {
        companies: chunk.map((a) => ({ linkedinSlug: a.slug })),
      });
      added += chunk.length;
      process.stdout.write(`\r  ${added}/${withSlug.length}`);
    } catch (err) {
      failed += chunk.length;
      console.log(`\n  chunk at ${i} failed: ${err.message}`);
    }
  }
  console.log(`\n  ${added} added, ${failed} failed`);

  await client.query(
    "update signal_watchlists set entity_count = $2 where org_id = $1 and external_id = $3",
    [orgId, added, listId],
  );

  const after = await getOrgCredits(key);
  const bal2 = Array.isArray(after?.output) ? after.output[0] : after?.output;
  console.log(`\nCredits: ${bal?.available ?? "?"} before, ${bal2?.available ?? "?"} after`);
  console.log(`\nNext: npm run signals:pull`);

  await client.end();
};

run().catch(async (err) => {
  console.error(redact(String(err?.message ?? err), key));
  await client.end().catch(() => {});
  process.exit(1);
});
