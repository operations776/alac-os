// Run: npm run verify:fiber
//
// Confirms the Fiber key resolves and reports what the account can do, using
// only the endpoints Fiber documents as FREE. It never calls a paid operation,
// so it is safe to run as often as you like and it cannot surprise anyone with
// a bill.
//
// It also prints the tracker rule catalogue, which is the thing worth reading
// before designing the pipeline: the rules are what Fiber can actually detect,
// and therefore what a heat signal can be built from.

import { config } from "dotenv";
import {
  listTrackerRules, getOrgCredits, getRateLimits, listTrackerCompanyLists,
  redact, FiberError,
} from "../src/lib/server/integrations/fiber.mjs";

config({ path: ".env.local" });

const key = process.env.FIBER_API_KEY;
if (!key) {
  console.error("FIBER_API_KEY is not set.");
  console.error("Add it to .env.local, which is gitignored:");
  console.error('  FIBER_API_KEY="..."');
  process.exit(1);
}

// The key is never printed, only its shape, which is enough to tell a pasted
// placeholder from a real credential.
console.log(`key: ${key.length} chars, starts ${key.slice(0, 4)}...\n`);

const step = async (label, fn) => {
  process.stdout.write(`  ${label.padEnd(26)}`);
  try {
    const out = await fn();
    console.log("ok");
    return out;
  } catch (err) {
    const msg = err instanceof FiberError ? `${err.status ?? ""} ${err.message}`.trim() : String(err);
    console.log(`FAILED  ${redact(msg, key)}`);
    return null;
  }
};

console.log("Free endpoints:");
const credits = await step("credits", () => getOrgCredits(key));
const limits = await step("rate limits", () => getRateLimits(key));
const lists = await step("tracker lists", () => listTrackerCompanyLists(key));
const rules = await step("tracker rules", () => listTrackerRules(key));

if (credits) console.log(`\ncredits: ${JSON.stringify(credits.output ?? credits).slice(0, 200)}`);
if (limits) console.log(`limits:  ${JSON.stringify(limits.output ?? limits).slice(0, 200)}`);

const companyLists = lists?.output?.lists ?? lists?.output ?? [];
console.log(`\ntracker company lists: ${Array.isArray(companyLists) ? companyLists.length : "unknown"}`);
if (Array.isArray(companyLists)) {
  for (const l of companyLists.slice(0, 10)) {
    console.log(`  ${l.id ?? l.listId ?? "?"}  ${l.name ?? ""}`);
  }
}

// The catalogue. This is what the pipeline can be built from, so it is printed
// in full rather than summarised.
const companyRules = rules?.output?.companyRules ?? [];
console.log(`\ncompany tracker rules: ${companyRules.length}`);
for (const r of companyRules) {
  console.log(`\n  ${r.name}`);
  console.log(`    ${r.readableName ?? ""}`);
  if (r.description) console.log(`    ${String(r.description).slice(0, 220)}`);
  if (r.config?.example) {
    console.log(`    config example: ${JSON.stringify(r.config.example).slice(0, 220)}`);
  }
}

const personRules = rules?.output?.personRules ?? [];
console.log(`\nperson tracker rules: ${personRules.length}`);
for (const r of personRules) console.log(`  ${r.name}  ${r.readableName ?? ""}`);

if (!credits && !rules) {
  console.error("\nEvery call failed. The key is probably wrong or expired.");
  process.exit(1);
}
console.log("\nverify:fiber done. No paid endpoint was called.");
