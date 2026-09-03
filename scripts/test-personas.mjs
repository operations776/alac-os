// Run: node scripts/test-personas.mjs
//
// The six organizational lanes and the routing rule built on them. The whole
// value of separating the lanes is the recommendation in section 14, so that
// example is the test. Names and companies here are invented.

import assert from "node:assert/strict";
import { laneOf, nextLane, LANES } from "../src/lib/scoring/personas.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

test("titles land in the lane a recruiter would put them in", () => {
  assert.equal(laneOf("Founder & CEO"), "executive");
  assert.equal(laneOf("President"), "executive");
  assert.equal(laneOf("Chief Technology Officer"), "functional");
  assert.equal(laneOf("Chief Scientist"), "functional");
  assert.equal(laneOf("Director of Flight Software"), "hiring_leader");
  assert.equal(laneOf("Engineering Manager"), "hiring_manager");
  assert.equal(laneOf("Head of Talent"), "talent");
  assert.equal(laneOf("VP People"), "talent");
});

test("the more specific lane wins over the general one", () => {
  // Both "head of" and "talent" match, and Talent is the right answer.
  assert.equal(laneOf("Head of Talent Acquisition"), "talent");
  // "Chief of Staff" is an executive, not a functional leader.
  assert.equal(laneOf("Chief of Staff"), "executive");
});

test("an unclassifiable title is not forced into a lane", () => {
  assert.equal(laneOf("Software Engineer II"), null);
  assert.equal(laneOf(""), null);
});

test("every lane has a label and a hint for the screen", () => {
  for (const l of LANES) {
    assert.ok(l.key && l.label && l.hint, JSON.stringify(l));
  }
});

/* ---- the routing rule, the example from section 14 ------------------- */

test("CEO attempted, engineering roles live, technical untouched, so technical is next", () => {
  const lanes = {
    executive: { status: "Attempted", people: 2 },
    functional: { status: "Untouched", people: 1 },
    hiring_leader: { status: "Untouched", people: 3 },
    talent: { status: "Untouched", people: 1 },
  };
  const next = nextLane({
    lanes,
    freshRoles: 4,
    roleTitles: ["Senior GNC Engineer", "Flight Software Engineer"],
  });
  assert.equal(next.lane, "functional");
  assert.match(next.why, /executive attempted with no reply/i);
});

test("commercial roles open route to the executive first", () => {
  const lanes = {
    executive: { status: "Untouched", people: 1 },
    functional: { status: "Untouched", people: 1 },
  };
  const next = nextLane({
    lanes,
    freshRoles: 2,
    roleTitles: ["Director of Business Development", "Capture Manager"],
  });
  assert.equal(next.lane, "executive");
});

test("a lane with nobody known is a sourcing job, not a routing one", () => {
  const next = nextLane({
    lanes: { executive: { status: "Untouched", people: 0 }, functional: { status: "Untouched", people: 0 } },
    freshRoles: 0,
    roleTitles: [],
  });
  assert.match(next.why, /Nobody is known or sourced/);
});

test("an attempted lane is not recommended again while another is untouched", () => {
  const next = nextLane({
    lanes: {
      executive: { status: "Attempted", people: 5 },
      functional: { status: "Attempted", people: 5 },
      talent: { status: "Untouched", people: 2 },
      hiring_leader: { status: "Untouched", people: 0 },
    },
    freshRoles: 0,
    roleTitles: [],
  });
  assert.equal(next.lane, "talent");
});

test("with every lane engaged there is no cold route to recommend", () => {
  const engaged = { status: "Engaged", people: 1 };
  const next = nextLane({
    lanes: {
      executive: engaged, functional: engaged, hiring_leader: engaged,
      hiring_manager: engaged, talent: engaged, connector: engaged,
    },
    freshRoles: 3,
    roleTitles: ["Engineer"],
  });
  assert.equal(next, null);
});

console.log(`\n${run} checks passed`);
