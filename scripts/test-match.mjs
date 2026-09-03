// Run: node scripts/test-match.mjs
//
// The Match Engine and the role scorer. Both decide what a producer sees, and
// both fail silently when they are wrong: a bad match looks like a match, and
// a bad score just sorts wrongly. Companies and people here are invented.
// Client data never enters this repo.

import assert from "node:assert/strict";
import { matchRole, bucketResults, parseQuery, tokens, levelOf } from "../src/lib/scoring/match.mjs";
import { roleScore, difficulty, aging } from "../src/lib/scoring/roles.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

const AS_OF = "2026-08-27";

/* ---- the role scorer, section 17.1 ---------------------------------- */

test("difficulty rises with clearance, seniority and specialism", () => {
  const easy = difficulty("Recruiting Coordinator").value;
  const mid = difficulty("Mechanical Engineer").value;
  const hard = difficulty("Principal GNC Engineer, TS/SCI").value;
  assert.ok(easy < mid, `${easy} < ${mid}`);
  assert.ok(mid < hard, `${mid} < ${hard}`);
  assert.ok(hard <= 100 && easy >= 0);
});

test("every difficulty carries the reasons behind it", () => {
  // Section 4: no score without a why. A number with no terms cannot be
  // interrogated, and the panel would render an empty breakdown.
  const d = difficulty("Principal GNC Engineer, TS/SCI");
  assert.ok(d.terms.length >= 3, JSON.stringify(d.terms));
  assert.ok(d.terms.some((t) => /clearance/i.test(t.term)));
  assert.ok(d.terms.every((t) => t.term && typeof t.points === "number"));
});

test("time open is the second half of the core, and it compounds", () => {
  assert.ok(aging("2026-08-26", AS_OF).value < aging("2026-07-01", AS_OF).value);
  assert.ok(aging("2026-07-01", AS_OF).value < aging("2026-01-01", AS_OF).value);
  assert.equal(aging(null, AS_OF).value, 20);
  assert.equal(aging("2026-07-01", AS_OF).age, 57);
});

test("a hard role open a long time beats an easy one posted today", () => {
  const hardOld = roleScore({ title: "Principal GNC Engineer, TS/SCI", first_seen: "2026-06-01" }, AS_OF);
  const easyNew = roleScore({ title: "Recruiting Coordinator", first_seen: AS_OF }, AS_OF);
  assert.ok(hardOld > easyNew, `${hardOld} > ${easyNew}`);
});

test("an easy role open forever is still not a strong lead", () => {
  // The core is a product, so one weak term holds the whole thing down.
  const easyOld = roleScore({ title: "Data Entry Clerk", first_seen: "2024-01-01" }, AS_OF);
  const hardMid = roleScore({ title: "Senior Avionics Engineer", first_seen: "2026-07-15" }, AS_OF);
  assert.ok(easyOld < hardMid, `${easyOld} < ${hardMid}`);
});

test("role scores stay inside 0 to 100", () => {
  const max = roleScore(
    { title: "Chief Hypersonic GNC Engineer TS/SCI Poly", first_seen: "2020-01-01", salary_text: "$400,000", open_at_company: 20 },
    AS_OF,
  );
  assert.ok(max <= 100 && max > 0, String(max));
});

/* ---- the matcher, sections 20 and 21 -------------------------------- */

const bd = {
  title: "Director of Business Development",
  summary: "Navy and USMC customer relationships, UAS and loitering munitions, capture",
  domains: "uas, navy",
  geography: "DMV",
};
bd.tokens = tokens(`${bd.title} ${bd.summary} ${bd.domains}`);

test("synonyms match what a recruiter would call the same job", () => {
  const t = tokens("Director BD");
  assert.ok(t.has("business development"), "BD should expand to business development");
  assert.ok(tokens("UAS programs").has("drone"));
});

test("a same-level same-domain role scores as an exact match", () => {
  const m = matchRole(bd, { title: "Director, Business Development, Navy Programs", location: "Arlington, Virginia", relevance: 70 });
  assert.ok(m.score >= 65, `expected exact, got ${m.score}`);
  assert.ok(m.why.length > 0);
});

test("a different function scores low even at the same level", () => {
  const m = matchRole(bd, { title: "Director of Manufacturing Quality", location: "Ohio", relevance: 60 });
  assert.ok(m.score < 65, `expected not exact, got ${m.score}`);
});

test("a hard constraint is reported, never silently applied", () => {
  const m = matchRole(bd, { title: "Director Business Development, TS/SCI required", relevance: 70 });
  assert.ok(m.flags.some((f) => /clearance/i.test(f)), m.flags.join("|"));
  assert.ok(m.score > 0, "a constraint flags, it does not zero the match");
});

test("level is a distance, not a match", () => {
  assert.equal(levelOf("VP of Engineering").key, "vp");
  assert.equal(levelOf("Chief Technology Officer").key, "executive");
  const oneStep = matchRole(bd, { title: "VP Business Development", relevance: 60 });
  const threeStep = matchRole(bd, { title: "Business Development Representative", relevance: 60 });
  assert.ok(oneStep.score > threeStep.score);
});

/* ---- never stop at zero, section 21.1 -------------------------------- */

test("with no matching requisition the screen still answers", () => {
  const accounts = [
    { id: "a", company_name: "Acme Aerospace", work_band: "now", work_score: 90, heat_score: 70, signal_text: "Raised money" },
    { id: "b", company_name: "Beta Systems", work_band: "now", work_score: 80, heat_score: null, signal_text: null },
  ];
  const b = bucketResults([], accounts);
  assert.equal(b.exact.length, 0);
  assert.equal(b.adjacent.length, 0);
  assert.ok(b.implied.length + b.strategic.length > 0, "both fallback buckets cannot be empty");
  assert.equal(b.implied[0].company_name, "Acme Aerospace", "a signal makes it implied demand");
  assert.equal(b.strategic[0].company_name, "Beta Systems", "no signal, still a strategic target");
});

test("a company already matched is not repeated in the lower buckets", () => {
  const accounts = [{ id: "a", company_name: "Acme Aerospace", work_band: "now", work_score: 90, heat_score: 70, signal_text: "Raised" }];
  const scored = [{ account_id: "a", company_name: "Acme Aerospace", match: { score: 80, why: [], flags: [] } }];
  const b = bucketResults(scored, accounts);
  assert.equal(b.exact.length, 1);
  assert.equal(b.implied.length, 0);
  assert.equal(b.strategic.length, 0);
});

/* ---- the natural language search, section 21 ------------------------ */

test("a typed search is read into structured filters", () => {
  const p = parseQuery("Director Navy BD in UAS, DMV, roles 70%+ open 45+ days");
  assert.equal(p.level, "director");
  assert.equal(p.geography, "washington");
  assert.equal(p.minScore, 70);
  assert.equal(p.minAge, 45);
});

test("an empty search asks for nothing in particular", () => {
  const p = parseQuery("");
  assert.equal(p.level, null);
  assert.equal(p.geography, null);
  assert.equal(p.minScore, null);
});

console.log(`\n${run} checks passed`);
