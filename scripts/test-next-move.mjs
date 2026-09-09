// Run: node scripts/test-next-move.mjs
//
// The next move is the one sentence every screen repeats, so it has to be
// predictable: same inputs, same instruction, and the rules in the order the
// file states them. Companies and people here are invented. Client data never
// enters this repo.

import assert from "node:assert/strict";
import { nextMove, lifecycle } from "../src/lib/scoring/next-move.mjs";
import { assignBands, describeMove } from "../src/lib/scoring/bands.mjs";
import { nextPullAt } from "../src/config/desk.mjs";

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

test("the stage is his Kanban, and outreach state outranks research state", () => {
  assert.equal(lifecycle(base), "Target");
  assert.equal(lifecycle({ ...base, prep_status: "IN RESEARCH" }), "Researching");
  assert.equal(lifecycle({ ...base, prep_status: "READY FOR QC" }), "Pending review");
  assert.equal(lifecycle({ ...base, prep_status: "APPROVED" }), "Approved");
  assert.equal(lifecycle({ ...base, prep_status: "APPROVED", sw_state: "Added" }), "In SourceWhale");
  assert.equal(lifecycle({ ...base, sw_state: "Active Campaign" }), "Campaign active");
  assert.equal(lifecycle({ ...base, sw_state: "Positive Reply" }), "Replied");
  assert.equal(lifecycle({ ...base, sw_state: "Active Campaign", disposition: "Hold" }), "On hold");
  assert.equal(lifecycle({ ...base, sw_state: "Active Campaign", disposition: "Archived" }), "Archived");
});

test("the cascade reaches the next move: hold and archive suggest nothing", () => {
  assert.equal(nextMove({ ...base, top_contact: "Jane Doe", targets: 1, fresh_roles: 3, disposition: "Hold" }, AS_OF).kind, "wait");
  assert.equal(nextMove({ ...base, top_contact: "Jane Doe", targets: 1, fresh_roles: 3, disposition: "Disqualified" }, AS_OF).move, "Nothing");
  assert.equal(nextMove({ ...base, top_contact: "Jane Doe", sw_state: "Replied", last_contacted_name: "Jane Doe" }, AS_OF).move, "Answer Jane Doe");
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

test("an active campaign means wait, whatever else is true", () => {
  const m = nextMove({ ...base, sw_state: "Active Campaign", fresh_roles: 5, top_contact: "Jane Doe" }, AS_OF);
  assert.equal(m.kind, "wait");
});

test("the next pull is always a real Monday or Thursday at 06:00 UTC", () => {
  const tue = new Date("2026-09-08T12:00:00Z");
  const next = nextPullAt(tue);
  assert.equal(next.toISOString(), "2026-09-10T06:00:00.000Z");
  const thuLate = new Date("2026-09-10T07:00:00Z");
  assert.equal(nextPullAt(thuLate).toISOString(), "2026-09-14T06:00:00.000Z");
});

test("a message sent this week means wait, then one follow up", () => {
  const a = { ...base, top_contact: "Jane Doe", targets: 1, last_contacted_at: "2026-08-25", last_contacted_name: "Jane Doe" };
  assert.equal(nextMove(a, AS_OF).move, "Wait for Jane Doe");
  assert.equal(nextMove({ ...a, last_contacted_at: "2026-08-15" }, AS_OF).move, "Follow up with Jane Doe");
  assert.equal(nextMove({ ...a, last_contacted_at: "2026-07-01", fresh_roles: 1 }, AS_OF).kind, "call");
});

test("the same input always gives the same move", () => {
  const a = { ...base, fresh_roles: 1, targets: 3, top_contact: "Jane Doe" };
  assert.deepEqual(nextMove(a, AS_OF), nextMove(a, AS_OF));
});

// Role scoring moved to difficulty x time open, per section 17.1, and is
// covered in test-match.mjs. The old assertion here asserted the opposite
// ordering and would now be a test of a model this app no longer uses.

test("a worked company never drops a band, an unworked one takes its place", () => {
  const rows = [
    { company_name: "a", work_score: 90 },
    { company_name: "b", work_score: 80 },
    { company_name: "c", work_score: 10, prev_band: "now", active: true },
    { company_name: "d", work_score: 5 },
  ];
  const out = Object.fromEntries(assignBands(rows, { nowSize: 2, nextSize: 1 }).map((r) => [r.company_name, r.work_band]));
  assert.equal(out.c, "now");
  assert.equal(out.b, "next");
  assert.equal(out.a, "now");
  assert.equal(out.d, "backlog");
});

test("moves are described in words", () => {
  assert.equal(describeMove(null, "next"), "Entered Up next");
  assert.equal(describeMove("backlog", "next", "Promoted on a strong signal. x"), "Up from Backlog to Up next: a strong signal");
  assert.equal(describeMove("next", "backlog", "whatever"), "Down from Up next to Backlog: others moved ahead");
});

console.log(`\n${run} checks passed`);
