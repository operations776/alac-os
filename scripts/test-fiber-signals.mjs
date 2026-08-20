// Run: node scripts/test-fiber-signals.mjs
//
// The fixtures below are the payloads Fiber's own preview-signal endpoint
// returned, copied verbatim. That matters: a parser tested against invented
// shapes proves only that it agrees with whoever invented them.
//
// Companies in the fixtures are Fiber's dummy data, not client data.

import assert from "node:assert/strict";
import {
  parseSignal, signalKey, signalEntity, toDate, formatAmount,
  WATCHED_RULES, IGNORED_RULES,
} from "../src/lib/server/integrations/fiber-signals.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

const wrap = (type, changeData, summary) => ({
  eventId: "evt_test",
  entity: { type: "company", identifiers: { linkedinSlug: "Acme-Robotics", linkedinOrgId: "1441", domain: "acme.test", name: "Acme Robotics" } },
  signal: { type, summary, changeData, isDummy: true },
});

test("funding gives an amount the scorer can use", () => {
  const s = parseSignal(
    wrap("new_funding_round",
      [{ type: "series_b", amountUsd: 12500000, date: "2026-05-15", investors: ["Sequoia Capital", "Accel Partners"], crunchbaseUrl: null }],
      "Series B: $13M raised"),
  );
  assert.equal(s.kind, "funding");
  assert.equal(s.amountUsd, 12500000, "amountUsd feeds the capital component directly");
  assert.equal(s.roundLabel, "series b");
  assert.equal(s.occurredAt, "2026-05-15");
  assert.match(s.detail, /Sequoia Capital/);
});

test("news carries a citable url, which is what grounding needs", () => {
  const s = parseSignal(
    wrap("company_news",
      [{ url: "https://www.bloomberg.com/news/dummy-article-2026", title: "Company expands operations", publishedAt: "2026-05-21T14:30:00.000Z", publisherName: "Bloomberg", summary: "Expanding into APAC.", sentiment: "positive" }],
      "1 new article detected"),
  );
  assert.equal(s.kind, "news");
  assert.equal(s.sourceUrl, "https://www.bloomberg.com/news/dummy-article-2026");
  assert.equal(s.occurredAt, "2026-05-21", "an ISO timestamp becomes the date the column stores");
  assert.equal(s.detail, "Expanding into APAC.");
});

test("headcount growth reads previous and current", () => {
  const s = parseSignal(
    wrap("headcount_growth_percent",
      [{ kind: "numeric", previous: 200, current: 260, direction: "increased", absoluteChange: 60, percentChange: 30 }],
      "Headcount grew by 30%: 200 → 260"),
  );
  assert.equal(s.kind, "growth");
  assert.equal(s.detail, "Headcount 200 to 260");
});

test("a job posting carries its own url and posted date", () => {
  const s = parseSignal(
    wrap("job_posting_with_keyword",
      [{ jobId: "DUMMY_JOB_3847291", title: "Senior engineer", jobUrl: "https://www.linkedin.com/jobs/view/DUMMY_JOB_3847291", location: "San Francisco, CA", seniorityLevel: "Senior", postedAt: "2026-05-20T00:00:00.000Z", status: "active" }],
      'New job posting: "Senior engineer"'),
  );
  assert.equal(s.kind, "hiring");
  assert.equal(s.occurredAt, "2026-05-20");
  assert.equal(s.detail, "Senior engineer, San Francisco, CA");
});

test("a leadership hire is named", () => {
  const s = parseSignal(
    wrap("recently_hired_with_title",
      [{ userId: "DUMMY_USER_918273", name: "Jane Smith", title: "VP", startDate: "2026-05-01T00:00:00.000Z", linkedinUrl: "https://www.linkedin.com/in/jane-smith-dummy" }],
      '1 new hire matching "VP"'),
  );
  assert.equal(s.kind, "leadership");
  assert.equal(s.detail, "Jane Smith joined as VP");
});

test("status change reads the scalar shape", () => {
  const s = parseSignal(
    wrap("company_status_changed", [{ kind: "scalar", previous: "operating", current: "acquired" }], "operating → acquired"),
  );
  assert.equal(s.detail, "Status operating to acquired");
});

/* ---- shapes the first draft got wrong -------------------------------- */
// These three were written from the preview endpoint and were wrong against
// the live poll. Fixed and pinned.

test("layoffs read numLaidOff, not count", () => {
  const s = parseSignal(
    wrap("recent_layoffs",
      [{ date: "2026-05-01T00:00:00.000Z", source: "https://example.test/layoffs", numLaidOff: 50, percentLaidOff: 12 }],
      "Laid off ~50 employees (12% of workforce)"),
  );
  assert.equal(s.detail, "50 roles cut, 12% of staff");
  assert.equal(s.sourceUrl, "https://example.test/layoffs");
  assert.equal(s.occurredAt, "2026-05-01");
});

test("an acquisition carries its price and target", () => {
  const s = parseSignal(
    wrap("acquired_company",
      [{ priceUsd: 50000000, acquireeUrl: "https://www.crunchbase.com/organization/dataflow-inc", acquireeName: "DataFlow Inc", acquisitionDate: "2026-05-10T00:00:00.000Z" }],
      "Acquired DataFlow Inc for $50M"),
  );
  assert.equal(s.amountUsd, 50000000, "the price feeds the capital component");
  assert.equal(s.detail, "Acquired DataFlow Inc");
  assert.equal(s.occurredAt, "2026-05-10");
});

test("a new office reads the address parts", () => {
  const s = parseSignal(
    wrap("new_office_location",
      [{ city: "Austin", state: null, country: "United States", changeType: "added" }],
      "New office opened in Austin, United States"),
  );
  assert.equal(s.detail, "New office: Austin, United States");
});

test("the sources array is the fallback citation", () => {
  const s = parseSignal({
    id: "x",
    type: "funding_stage_changed",
    summary: "series_a → series_b",
    changeData: [{ kind: "scalar", previous: "series_a", current: "series_b" }],
    sources: ["https://www.linkedin.com/company/1441/"],
    linkedinSlug: "acme",
  });
  assert.equal(s.sourceUrl, "https://www.linkedin.com/company/1441/", "a rule with no url of its own still cites something");
});

test("methodology is carried through as evidence", () => {
  const s = parseSignal({
    id: "x", type: "company_news", summary: "1 article",
    changeData: [{ url: "https://example.test/a" }],
    methodology: "Detected via news crawl and verified against two sources.",
    linkedinSlug: "acme",
  });
  assert.match(s.methodology, /verified/);
});

test("the flat polled envelope parses, not just the nested webhook one", () => {
  // listTrackerSignals returns a flat signal; the webhook nests it under
  // `signal` with `entity.identifiers`. Both must work.
  const flat = {
    id: "lklQWkU1Jbls0KWC", type: "new_funding_round", summary: "Series B: $3M raised",
    changeData: [{ date: "2026-05-15", type: "series_b", amountUsd: 2500000 }],
    linkedinSlug: "Google", linkedinUrl: "https://www.linkedin.com/company/google",
    observedAt: "2026-08-20T11:03:52.230Z", isDummy: true,
  };
  const s = parseSignal(flat);
  assert.equal(s.amountUsd, 2500000);
  assert.equal(signalEntity(flat).slug, "google", "slug must lowercase for matching either way");
});

/* ---- the things that must NOT happen -------------------------------- */

test("an ignored rule is dropped, not scored", () => {
  assert.equal(parseSignal(wrap("company_logo_changed", [{}], "Logo updated")), null);
  assert.equal(parseSignal(wrap("follower_count_growth", [{}], "+2000 followers")), null);
  // and every ignored rule has a stated reason, so the omission is auditable
  for (const [rule, reason] of Object.entries(IGNORED_RULES)) {
    assert.ok(reason && reason.length > 3, `${rule} must say why it is ignored`);
    assert.ok(!WATCHED_RULES[rule], `${rule} cannot be both watched and ignored`);
  }
});

test("an unknown rule type is dropped rather than throwing", () => {
  assert.equal(parseSignal(wrap("some_future_rule", [{}], "?")), null);
});

test("a malformed payload yields nulls, never an exception", () => {
  // One bad signal must not take down a pull of two hundred.
  for (const bad of [
    wrap("new_funding_round", null, null),
    wrap("new_funding_round", [], null),
    wrap("company_news", [{}], null),
    wrap("job_posting_with_keyword", "not-an-array", null),
    {},
    { signal: {} },
  ]) {
    assert.doesNotThrow(() => parseSignal(bad));
  }
  const empty = parseSignal(wrap("new_funding_round", [], null));
  assert.equal(empty.amountUsd, null, "no data must read as unknown, not as zero raised");
});

/* ---- identity -------------------------------------------------------- */

test("eventId is the dedupe key when present", () => {
  assert.equal(signalKey({ eventId: "evt_abc" }, "acme", "2026-05-15"), "fiber:evt_abc");
});

test("without an eventId the key is stable across re-pulls", () => {
  const s = { signal: { type: "new_funding_round" } };
  const a = signalKey(s, "acme robotics", "2026-05-15");
  const b = signalKey(s, "acme robotics", "2026-05-15");
  assert.equal(a, b, "the same signal pulled twice must produce the same key");
  assert.notEqual(a, signalKey(s, "acme robotics", "2026-06-01"));
});

test("the entity slug is lowercased for matching", () => {
  const e = signalEntity(wrap("company_news", [{}], ""));
  assert.equal(e.slug, "acme-robotics", "tam_accounts slugs are lowercase, so this must be too");
  assert.equal(e.domain, "acme.test");
  assert.equal(e.name, "Acme Robotics");
});

/* ---- formatting ------------------------------------------------------ */

test("amounts format the way the workbook writes them", () => {
  assert.equal(formatAmount(12_500_000), "$13M");
  assert.equal(formatAmount(1_370_000_000), "$1.4B");
  assert.equal(formatAmount(820_000), "$820K");
  assert.equal(formatAmount(null), null);
  assert.equal(formatAmount("nonsense"), null);
});

test("dates normalize, and rubbish stays null", () => {
  assert.equal(toDate("2026-05-21T14:30:00.000Z"), "2026-05-21");
  assert.equal(toDate("2026-05-21"), "2026-05-21");
  assert.equal(toDate(null), null);
  assert.equal(toDate("not a date"), null);
});

console.log(`\n${run} checks passed`);
