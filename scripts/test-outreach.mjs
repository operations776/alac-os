// The draft gate. What gets rejected, and what gets cleaned up on the way past.
//
// Every fixture carries the credential, because a message without it is
// rejected on its own and would otherwise mask the fault each case is testing.

import assert from "node:assert/strict";
import { __checkDraft as checkDraft } from "../src/lib/server/ai/outreach.mjs";

let passed = 0;
function ok(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

const CRED = "20 years in the Marine Corps, most of it in talent management.";
const HAYSTACK = "acme aerospace raised 450m series e and is hiring propulsion engineers".toLowerCase();

ok("a banned phrase is rejected by name", () => {
  const fault = checkDraft({ message: `I noticed you are hiring. ${CRED}`, facts_used: [] }, HAYSTACK);
  assert.match(fault ?? "", /i noticed/);
});

ok("an em dash is rejected", () => {
  const fault = checkDraft(
    { message: `You raised a round \u2014 congratulations. ${CRED}`, facts_used: [] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /em dash/);
});

ok("a fact absent from the research is rejected", () => {
  const fault = checkDraft(
    { message: `Congratulations on the Tokyo office. ${CRED}`, facts_used: ["opened a Tokyo office"] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /not in the research/);
});

ok("a grounded draft passes", () => {
  const draft = {
    message: `Your 450M Series E is a real milestone. ${CRED}`,
    facts_used: ["raised 450M Series E"],
  };
  assert.equal(checkDraft(draft, HAYSTACK), null);
});

ok("curly punctuation is flattened rather than rejected", () => {
  const draft = {
    message: `It\u2019s your \u201Cbig\u201D year\u2026 propulsion hiring is on. ${CRED}`,
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
  const fault = checkDraft({ message: `${"word ".repeat(140)} ${CRED}`, facts_used: [] }, HAYSTACK);
  assert.match(fault ?? "", /\d+ words/);
});

ok("a consultant question is rejected", () => {
  const fault = checkDraft(
    { message: `${CRED} How are you balancing speed with quality?`, facts_used: [] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /consultant question/);
});

ok("a message missing the credential is rejected", () => {
  const fault = checkDraft(
    { message: "Saw you have 44 open roles. Curious, is your team covering all of it?", facts_used: [] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /credential/);
});

ok("the full shape passes", () => {
  const draft = {
    message: `Hi Jane,\n\nYour 450M Series E landed last month.\n\n${CRED} I co-founded ALAC almost four years ago recruiting for deep tech and defense.\n\nSaw you have 44 open roles across 16 locations.\n\nCurious, is your team covering all of it?`,
    opening_line: "Your 450M Series E landed last month.",
    facts_used: ["raised 450M Series E", "hiring propulsion engineers"],
  };
  assert.equal(checkDraft(draft, HAYSTACK), null);
});

ok("the same number stated twice is rejected", () => {
  const fault = checkDraft(
    { message: `${CRED} You have 44 open roles. The number of open roles is 44.`, facts_used: [] },
    HAYSTACK,
  );
  assert.match(fault ?? "", /more than once/);
});

console.log(`\n${passed} checks passed`);
