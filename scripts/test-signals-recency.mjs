// Run: node scripts/test-signals-recency.mjs
//
// A signal dated in the future is an announcement about a plan, not news.
// The old scorer clamped a future date to zero days old and handed it full
// recency, so a 2034 expansion outranked a round that closed last week on a
// board called What changed. Companies here are invented.

import assert from "node:assert/strict";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

/**
 * The recency curve, copied from signals-predictleads.mjs. It lives in a
 * script rather than a module because the pull is a script, so this asserts
 * the shape of the curve rather than importing it.
 */
function recencyFor(days) {
  return days < 0
    ? (days > -90 ? 0.5 : days > -365 ? 0.25 : 0.1)
    : days <= 30 ? 1 : days <= 90 ? 0.85 : days <= 180 ? 0.6 : days <= 365 ? 0.35 : 0.15;
}

test("something that happened this month is worth the most", () => {
  assert.equal(recencyFor(5), 1);
  assert.equal(recencyFor(30), 1);
});

test("recency decays as an event ages", () => {
  assert.ok(recencyFor(60) < recencyFor(20));
  assert.ok(recencyFor(200) < recencyFor(60));
  assert.ok(recencyFor(400) < recencyFor(200));
});

test("a plan for the future never outranks something that happened", () => {
  // The bug: a 2034 announcement scored as if it happened today.
  const eightYearsOut = -365 * 8;
  assert.ok(recencyFor(eightYearsOut) < recencyFor(5), "far future must not beat this week");
  assert.ok(recencyFor(eightYearsOut) < recencyFor(200), "far future must not beat six months ago");
  assert.equal(recencyFor(eightYearsOut), 0.1);
});

test("the nearer the plan, the more it says about hiring now", () => {
  assert.ok(recencyFor(-30) > recencyFor(-200));
  assert.ok(recencyFor(-200) > recencyFor(-1000));
});

test("a plan next month still counts for something", () => {
  // Opening an office in six weeks is a real hiring signal, just not news.
  assert.equal(recencyFor(-45), 0.5);
});

console.log(`\n${run} checks passed`);
