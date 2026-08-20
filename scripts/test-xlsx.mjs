// Run: node scripts/test-xlsx.mjs
//
// One check, for the failure that actually happened while building the
// importer: a self closing empty cell swallowing the next cell, so a value
// lands under the wrong column letter and its shared string is never resolved.
// That corruption is silent, so it needs a test rather than a careful read.

import assert from "node:assert/strict";
import { parseCells, serialToISO, colIdx } from "../src/lib/server/import/xlsx.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

// Taken verbatim from the workbook: K and L are empty and self closing, M holds
// a shared string. The naive regex reports M's value under column K.
const ROW =
  '<c r="A5" s="35" t="s"><v>464</v></c>' +
  '<c r="C5" s="35"><v>96.0</v></c>' +
  '<c r="K5" s="38"/>' +
  '<c r="L5" s="39"/>' +
  '<c r="M5" s="36" t="s"><v>501</v></c>' +
  '<c r="N5" s="36"/>';

const SHARED = [];
SHARED[464] = "ALAC-01257";
SHARED[501] = "NOT LOADED";

// An absent cell and a self closing cell are both "no value"; the parser
// reports the first as undefined and the second as "". Callers treat them the
// same, so the check is emptiness, not which of the two it is.
const empty = (v) => (v ?? "") === "";

test("self closing cells do not swallow the next cell", () => {
  const c = parseCells(ROW, SHARED);
  assert.equal(c[colIdx("A5")], "ALAC-01257", "A must resolve its shared string");
  assert.equal(c[colIdx("C5")], "96.0", "C must keep its numeric value");
  assert.ok(empty(c[colIdx("K5")]), "K is empty and must stay empty");
  assert.ok(empty(c[colIdx("L5")]), "L is empty and must stay empty");
  // The regression: with a naive cell regex this is "501" sitting under K.
  assert.equal(c[colIdx("M5")], "NOT LOADED", "M must land under M, resolved");
});

test("a trailing self closing cell does not appear as a value", () => {
  const c = parseCells(ROW, SHARED);
  assert.ok(empty(c[colIdx("N5")]));
});

test("column letters past Z", () => {
  assert.equal(colIdx("A1"), 0);
  assert.equal(colIdx("Z1"), 25);
  assert.equal(colIdx("AA1"), 26);
  assert.equal(colIdx("AB1"), 27);
});

test("excel serial dates", () => {
  // 46252 is the workbook's own "last scored" stamp.
  assert.equal(serialToISO(46252), "2026-08-18");
  assert.equal(serialToISO("46251"), "2026-08-17");
  assert.equal(serialToISO(""), null);
  assert.equal(serialToISO(0), null);
});

test("entities are unescaped", () => {
  const c = parseCells('<c r="A1" t="inlineStr"><is><t>R&amp;D &lt;lead&gt;</t></is></c>');
  assert.equal(c[0], "R&D <lead>");
});

console.log(`\n${run} checks passed`);
