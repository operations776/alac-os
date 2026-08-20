// Run: node scripts/test-heat.mjs
//
// The heat scorer is the one number this app computes rather than imports, so
// it is the one piece that has to be provably reproducible. These checks cover
// the properties that make it trustworthy: it is deterministic, it respects
// every ceiling, a missing input degrades to null rather than to zero, and the
// components always reconcile to the total.
//
// Companies here are invented. Client data never enters this repo.

import assert from "node:assert/strict";
import {
  COMPONENTS, scoreHeat, heatVsTam, freshness, capital, access,
  hiringUrgency, talentScarcity, ageInDays,
} from "../src/lib/scoring/heat.mjs";

let run = 0;
const test = (name, fn) => {
  fn();
  run += 1;
  console.log(`  ok  ${name}`);
};

const AS_OF = "2026-08-20";

const FULL = {
  asOf: AS_OF,
  signalDate: "2026-08-18",
  priority: "priority_1",
  finalScore: 90,
  amountUsd: 100_000_000,
  roundLabel: "Series C",
  warmContacts: 3,
  decisionMakers: 1,
  jobs: [
    { title: "VP of Propulsion", seniority: "vp", posted_at: "2026-08-15", qualified: true },
    { title: "Staff GNC Engineer", seniority: "senior", posted_at: "2026-08-10", qualified: true },
    { title: "Principal RF Engineer, TS/SCI required", seniority: "senior", posted_at: "2026-07-01", qualified: true },
  ],
};

/* ---- determinism and reconciliation ---------------------------------- */

test("same inputs give the same score", () => {
  const a = scoreHeat(FULL);
  const b = scoreHeat(FULL);
  assert.deepEqual(a, b);
});

test("components reconcile to the total", () => {
  const r = scoreHeat(FULL);
  const sum = Object.values(r.components).reduce((n, v) => n + (v ?? 0), 0);
  assert.equal(sum, r.heat_score, "the six components must add up to the stored total");
});

test("terms reconcile to their component", () => {
  const r = scoreHeat(FULL);
  for (const { key } of COMPONENTS) {
    if (r.components[key] == null) continue;
    const termSum = r.terms.filter((t) => t.component === key).reduce((n, t) => n + t.points, 0);
    // Terms may over-earn and be clamped by the ceiling, so the invariant is
    // that a component never exceeds its terms, never that they are equal.
    assert.ok(
      r.components[key] <= termSum + 1,
      `${key} scored ${r.components[key]} but its terms only earn ${termSum}`,
    );
  }
});

test("no component exceeds its ceiling, at any input", () => {
  // Deliberately absurd inputs: every component should clamp, not overflow.
  const huge = {
    asOf: AS_OF,
    signalDate: AS_OF,
    priority: "priority_1",
    finalScore: 100,
    amountUsd: 50_000_000_000,
    warmContacts: 500,
    decisionMakers: 200,
    jobs: Array.from({ length: 400 }, () => ({
      title: "Chief Principal Staff GNC Propulsion Engineer, TS/SCI clearance",
      seniority: "executive",
      posted_at: AS_OF,
      qualified: true,
    })),
  };
  const r = scoreHeat(huge);
  for (const { key, max } of COMPONENTS) {
    assert.ok(r.components[key] <= max, `${key} scored ${r.components[key]}, ceiling is ${max}`);
  }
  assert.ok(r.heat_score <= 100, `total ${r.heat_score} exceeds 100`);
});

/* ---- missing data degrades honestly ---------------------------------- */

test("a missing input yields null, not zero", () => {
  const r = scoreHeat({ asOf: AS_OF, signalDate: "2026-08-18", priority: "priority_2", finalScore: 70 });
  assert.equal(r.components.hiring_urgency, null, "no job data must not read as no hiring");
  assert.equal(r.components.capital, null, "no amount must not read as no money");
  assert.equal(r.components.access, null, "unmatched network must not read as no access");
  // The ones that can still be answered are answered.
  assert.ok(r.components.icp_fit > 0);
  assert.ok(r.components.freshness > 0);
});

test("coverage reports how much of the model was assessable", () => {
  const full = scoreHeat(FULL);
  assert.equal(full.coverage, 100);

  const partial = scoreHeat({ asOf: AS_OF, signalDate: "2026-08-18", priority: "priority_2" });
  // icp_fit 20 + freshness 10 of 100.
  assert.equal(partial.coverage, 30);
  assert.equal(partial.gaps.length, 4);
  for (const g of partial.gaps) assert.ok(g.reason, `gap on ${g.component} must state why`);
});

test("an empty job list is zero, a missing job list is null", () => {
  assert.equal(hiringUrgency({ jobs: [], asOf: AS_OF }).value, 0, "looked and found nothing");
  assert.equal(hiringUrgency({ asOf: AS_OF }).value, null, "did not look");
  assert.equal(talentScarcity({ jobs: [] }).value, 0);
  assert.equal(talentScarcity({}).value, null);
});

/* ---- individual components ------------------------------------------- */

test("freshness decays and rejects a future date", () => {
  assert.equal(freshness({ signalDate: "2026-08-18", asOf: AS_OF }).value, 10);
  assert.equal(freshness({ signalDate: "2026-08-09", asOf: AS_OF }).value, 7);
  assert.equal(freshness({ signalDate: "2026-08-01", asOf: AS_OF }).value, 4);
  assert.equal(freshness({ signalDate: "2026-05-01", asOf: AS_OF }).value, 0);
  // A future dated signal is a data error, and must not score as very fresh.
  const future = freshness({ signalDate: "2026-09-20", asOf: AS_OF });
  assert.equal(future.value, null);
  assert.match(future.reason, /future/);
});

test("capital is a log scale, not a linear one", () => {
  const m10 = capital({ amountUsd: 10_000_000 }).value;
  const m100 = capital({ amountUsd: 100_000_000 }).value;
  const b1 = capital({ amountUsd: 1_000_000_000 }).value;
  assert.equal(m10, 5);
  assert.equal(m100, 10);
  assert.equal(b1, 15);
  // Each decade is worth the same, which is the property that keeps a mega
  // round from swamping every other component.
  assert.equal(m100 - m10, b1 - m100);
  assert.equal(capital({ amountUsd: 0 }).value, 0);
  assert.equal(capital({}).value, null);
});

test("access rewards a known decision maker most", () => {
  assert.equal(access({ warmContacts: 0, decisionMakers: 0 }).value, 0);
  assert.equal(access({ warmContacts: 1, decisionMakers: 1 }).value, 4);
  assert.ok(
    access({ warmContacts: 1, decisionMakers: 1 }).value > access({ warmContacts: 3, decisionMakers: 0 }).value,
    "one decision maker beats three unknown contacts",
  );
  assert.equal(access({}).value, null);
});

test("an unqualified company still scores mid band on ICP fit", () => {
  // The companies that signal before the TAM catches up are the point of the
  // board, so they must not be buried at zero.
  const r = scoreHeat({ asOf: AS_OF, signalDate: AS_OF, priority: null, finalScore: null });
  assert.equal(r.components.icp_fit, 12);
});

test("scarcity markers are detected in title or description", () => {
  const cleared = talentScarcity({ jobs: [{ title: "Engineer", description: "TS/SCI required" }] });
  assert.ok(cleared.value >= 6);
  const plain = talentScarcity({ jobs: [{ title: "Office Manager", description: "" }] });
  assert.equal(plain.value, 0);
});

/* ---- the delta -------------------------------------------------------- */

test("heat vs TAM is the delta, and null without a TAM score", () => {
  assert.equal(heatVsTam(88, 70), 18);
  assert.equal(heatVsTam(70, 88), -18);
  assert.equal(heatVsTam(88, null), null, "no TAM score means no comparison, not a zero delta");
  assert.equal(heatVsTam(88, "70.0"), 18, "the column is numeric, so a string must still work");
});

test("age is whole days and order sensitive", () => {
  assert.equal(ageInDays("2026-08-18", "2026-08-20"), 2);
  assert.equal(ageInDays("2026-08-20", "2026-08-20"), 0);
  assert.equal(ageInDays(null, AS_OF), null);
});

console.log(`\n${run} checks passed`);

/* ---- domain cleaning -------------------------------------------------- */
// Enrichment tools return the same domain in half a dozen shapes, and a wrong
// domain silently searches the wrong company, so this normalizes hard and
// rejects anything that is not a domain rather than storing it.
{
  const { cleanDomain } = await import("../src/lib/server/import/normalize.mjs");
  {
    test("domains normalize from every shape a tool returns", () => {
      assert.equal(cleanDomain("https://astranis.com/"), "astranis.com");
      assert.equal(cleanDomain("www.astranis.com"), "astranis.com");
      assert.equal(cleanDomain("HTTPS://WWW.Astranis.com/careers?x=1"), "astranis.com");
      assert.equal(cleanDomain("  astranis.com  "), "astranis.com");
      assert.equal(cleanDomain("neros.tech"), "neros.tech");
      assert.equal(cleanDomain("trueanomaly.space"), "trueanomaly.space");
    });

    test("an email in the domain column yields its host", () => {
      assert.equal(cleanDomain("nick@astranis.com"), "astranis.com");
    });

    test("anything that is not a domain is rejected, not stored", () => {
      for (const bad of ["", "  ", "-", "n/a", "none", "not found", "TBD", "astranis", "a b c", null, undefined]) {
        assert.equal(cleanDomain(bad), null, `"${bad}" must not become a domain`);
      }
    });
  }
}
