// Run: node scripts/test-next-move.mjs
//
// The next move is the one sentence every screen repeats, so it has to be
// predictable: same inputs, same instruction, and the rules in the order the
// file states them. Companies and people here are invented. Client data never
// enters this repo.

import assert from "node:assert/strict";
import { nextMove, lifecycle } from "../src/lib/scoring/next-move.mjs";
import { roleScore } from "../src/lib/scoring/roles.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

const AS_OF = "2026-08-27";
const base = {
  prep_status: "NOT STARTED",
  recommended_motion: "TBD",
  heyreach_stage: "NOT LOADED",
  sourcewhale_stage: "NOT LOADED",
  fresh_roles: 0,
  signal_date: null,
  signal_category: null,
  decision_makers: 0,
  warm_contacts: 0,
  targets: 0,
  top_contact: null,
  has_draft: false,
  domain: "acme.example",
};

test("lifecycle is derived from the three stage fields, outreach outranking prep", () => {
  assert.equal(lifecycle(base), "Not started");
  assert.equal(lifecycle({ ...base, prep_status: "READY FOR QC" }), "Needs review");
  assert.equal(lifecycle({ ...base, prep_status: "APPROVED", heyreach_stage: "LOADED" }), "LinkedIn warming");
  assert.equal(lifecycle({ ...base, heyreach_stage: "LOADED", sourcewhale_stage: "ACTIVE" }), "In sequence");
  assert.equal(lifecycle({ ...base, prep_status: "HOLD", sourcewhale_stage: "ACTIVE" }), "On hold");
});

test("no website means nothing else can happen", () => {
  assert.equal(nextMove({ ...base, domain: null }, AS_OF).move, "Find their website");
});

test("no contact means source one before anything", () => {
  assert.equal(nextMove(base, AS_OF).move, "Source a contact");
});

test("a fresh role and a known person is a call", () => {
  const m = nextMove({ ...base, fresh_roles: 2, decision_makers: 1, top_contact: "Jane Doe" }, AS_OF);
  assert.equal(m.kind, "call");
  assert.equal(m.move, "Call Jane Doe about the 2 new roles");
});

test("a signal inside the month with a contact is a message", () => {
  const m = nextMove(
    { ...base, warm_contacts: 1, top_contact: "Jane Doe", signal_date: "2026-08-20", signal_category: "receives_financing" },
    AS_OF,
  );
  assert.equal(m.move, "Message Jane Doe about what changed");
  assert.match(m.why, /raised money 7 days ago/);
});

test("a stale signal does not argue for timing", () => {
  const m = nextMove({ ...base, warm_contacts: 1, top_contact: "Jane Doe", signal_date: "2026-01-01" }, AS_OF);
  assert.equal(m.move, "Draft the first message");
});

test("in sequence means wait, whatever else is true", () => {
  const m = nextMove({ ...base, sourcewhale_stage: "ACTIVE", fresh_roles: 5, top_contact: "Jane Doe" }, AS_OF);
  assert.equal(m.kind, "wait");
});

test("the same input always gives the same move", () => {
  const a = { ...base, fresh_roles: 1, targets: 3, top_contact: "Jane Doe" };
  assert.deepEqual(nextMove(a, AS_OF), nextMove(a, AS_OF));
});

test("role relevance is freshness first and capped at 100", () => {
  const today = roleScore({ title: "Senior Engineer", first_seen: AS_OF, salary_text: "$1" }, AS_OF);
  const old = roleScore({ title: "Senior Engineer", first_seen: "2026-06-01", salary_text: "$1" }, AS_OF);
  assert.ok(today > old);
  assert.ok(roleScore({ title: "Chief Engineer", first_seen: AS_OF, salary_text: "x" }, AS_OF) <= 100);
});

console.log(`\n${run} checks passed`);
