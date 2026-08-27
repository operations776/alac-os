// The role qualifier and the signal weighting.
//
// The qualifier earns a test because it silently returned false for every
// title once: a regex written with a literal backspace where a word boundary
// belonged. Nothing failed, 4,122 postings simply came back as zero qualified,
// and the only symptom was a number that looked plausible.

import assert from "node:assert/strict";
import { qualifyRole, CATEGORY_WEIGHT, describeSignal } from "../src/lib/server/integrations/predictleads.mjs";

let passed = 0;
function ok(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

ok("engineering titles qualify", () => {
  for (const t of [
    "Senior Technical Program Manager, Quality",
    "Staff Optical Test Engineer",
    "Software Engineer",
    "Director of Manufacturing",
    "Principal Scientist",
  ]) {
    assert.equal(qualifyRole(t), true, t);
  }
});

ok("junior and non technical titles do not", () => {
  for (const t of ["Intern, Software", "Barista", "Office Manager", "Student Trainee"]) {
    assert.equal(qualifyRole(t), false, t);
  }
});

ok("an empty title is not a role", () => {
  assert.equal(qualifyRole(""), false);
  assert.equal(qualifyRole(), false);
});

ok("financing outweighs a partnership", () => {
  assert.ok(CATEGORY_WEIGHT.receives_financing > CATEGORY_WEIGHT.partners_with);
  assert.ok(CATEGORY_WEIGHT.increases_headcount_by > CATEGORY_WEIGHT.launches);
});

ok("a departure is weighted, because it is a backfill", () => {
  assert.ok(CATEGORY_WEIGHT.leaves > 0);
});

ok("a signal describes itself without a summary", () => {
  const s = { category: "receives_financing", amount: 250_000_000, financing_type: "Series C" };
  assert.match(describeSignal(s), /Raised.*250,000,000.*Series C/);
});

ok("a stored summary is preferred over a generated one", () => {
  const s = { category: "receives_financing", summary: "Raised $250M led by Sequoia." };
  assert.equal(describeSignal(s), "Raised $250M led by Sequoia.");
});

console.log(`\n${passed} checks passed`);
