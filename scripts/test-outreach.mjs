// The draft gate. What gets rejected, and what gets cleaned up on the way past.

import assert from "node:assert/strict";
import { __checkDraft as checkDraft } from "../src/lib/server/ai/outreach.mjs";

let passed = 0;
function ok(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

const HAYSTACK = "acme aerospace raised 450m series e and is hiring propulsion engineers".toLowerCase();

ok("a banned phrase is rejected by name", () => {
  const fault = checkDraft({ message: "I noticed you are hiring.", facts_used: [] }, HAYSTACK);
  assert.match(fault ?? "", /i noticed/);
});

ok("an em dash is rejected", () => {
  const fault = checkDraft({ message: "You raised a round \u2014 congratulations.", facts_used: [] }, HAYSTACK);
  assert.match(fault ?? "", /em dash/);
});

ok("a fact absent from the research is rejected", () => {
  const fault = checkDraft(
    { message: "Congratulations on the Tokyo office.", facts_used: ["opened a Tokyo office"] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /not in the research/);
});

ok("a grounded draft passes", () => {
  const draft = { message: "Your 450M Series E is a real milestone.", facts_used: ["raised 450M Series E"] };
  assert.equal(checkDraft(draft, HAYSTACK), null);
});

ok("curly punctuation is flattened rather than rejected", () => {
  const draft = {
    message: "It\u2019s your \u201Cbig\u201D year\u2026 propulsion hiring is on.",
    opening_line: "It\u2019s your \u201Cbig\u201D year\u2026",
    facts_used: ["hiring propulsion engineers"],
  };
  assert.equal(checkDraft(draft, HAYSTACK), null);
  assert.equal(draft.message.includes("\u2019"), false);
  assert.equal(draft.message.includes("\u201C"), false);
  assert.equal(draft.message.includes("\u2026"), false);
  assert.match(draft.message, /It's your "big" year\.\.\./);
  assert.equal(draft.opening_line.includes("\u2019"), false);
});

ok("an overlong draft is rejected with its length", () => {
  const fault = checkDraft({ message: "word ".repeat(140), facts_used: [] }, HAYSTACK);
  assert.match(fault ?? "", /140 words/);
});

console.log(`\n${passed} checks passed`);
