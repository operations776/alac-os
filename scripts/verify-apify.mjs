// Run: npm run verify:apify
//
// Confirms the Apify token works and that the configured jobs actor actually
// returns postings for a known company, which is the part that matters: a
// token can be valid while the actor is broken, renamed, or returning an empty
// dataset because LinkedIn changed its markup.
//
// The test run costs a few cents at most, because it asks for one company and
// a handful of rows.

import { config } from "dotenv";
import { me, fetchJobsForCompanies, normalizeJob, JOBS_ACTOR, redact } from "../src/lib/server/integrations/apify.mjs";

config({ path: ".env.local" });

const tok = process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN;
if (!tok) {
  console.error("APIFY_TOKEN is not set.");
  console.error("Get one from https://console.apify.com/settings/integrations");
  console.error('Then add it to .env.local:  APIFY_TOKEN="apify_api_..."');
  process.exit(1);
}
console.log(`token: ${tok.length} chars, starts ${tok.slice(0, 10)}...\n`);

try {
  const who = await me();
  const u = who?.data ?? who;
  console.log("account:");
  console.log(`  username    ${u?.username ?? "?"}`);
  console.log(`  plan        ${u?.plan?.id ?? u?.plan ?? "?"}`);
  const usage = u?.monthlyUsage ?? u?.limits ?? null;
  if (usage) console.log(`  usage       ${JSON.stringify(usage).slice(0, 160)}`);
} catch (err) {
  console.error(`whoami failed: ${redact(String(err.message))}`);
  process.exit(1);
}

// A live run against one company. Astranis is used because the real count is
// already known from Fiber, 599, so a result of zero is clearly a broken actor
// rather than a company that is not hiring.
console.log(`\nactor: ${JOBS_ACTOR}`);
console.log("running against one company (astranis), this can take a minute...");

try {
  const items = await fetchJobsForCompanies(["astranis"], { maxPerCompany: 5 });
  console.log(`  raw items: ${items.length}`);

  const jobs = items.map(normalizeJob).filter(Boolean);
  console.log(`  parsed:    ${jobs.length}`);

  if (jobs.length === 0) {
    console.log("\n  The actor returned nothing usable.");
    console.log("  Fiber reports 599 open roles at this company, so zero here means the");
    console.log("  actor is broken, renamed, or its input keys have changed rather than");
    console.log("  the company having no openings.");
    console.log("  Try another actor with:  APIFY_JOBS_ACTOR=\"user/actor-name\"");
    if (items.length > 0) {
      console.log(`\n  first raw item keys: ${Object.keys(items[0]).join(", ").slice(0, 300)}`);
    }
    process.exit(1);
  }

  console.log("");
  for (const j of jobs.slice(0, 5)) {
    console.log(`  ${String(j.posted_at ?? "undated").padEnd(12)}${String(j.title).slice(0, 50).padEnd(52)}${j.location ?? ""}`);
  }
  console.log("\nverify:apify done. The actor works.");
} catch (err) {
  console.error(`\nactor run failed: ${redact(String(err.message))}`);
  console.error("If this is a 404, the actor id is wrong. Set APIFY_JOBS_ACTOR to another.");
  process.exit(1);
}
