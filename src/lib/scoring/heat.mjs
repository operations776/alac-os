// The heat scorer.
//
// A pure function. Same inputs, same 100 point score, every time, and it never
// calls a network. That is the whole point: the number the desk acts on has to
// be reproducible and auditable, so the model lives here and the fetching lives
// in the importers.
//
// It returns the six components AND the terms behind each one, so a screen can
// show why a component scored what it did rather than asking anyone to trust a
// total. The component ceilings match the check constraints on heat_signals.
//
// Every component degrades honestly. When an input is missing the component
// returns null rather than 0, because "we did not look" and "we looked and
// found nothing" are different facts and only one of them should push an
// account down the board. A null component is excluded from the total and
// reported as a coverage gap.

/** The six components, their ceilings, and the order they are shown in. */
export const COMPONENTS = [
  { key: "hiring_urgency", label: "Hiring urgency", max: 30 },
  { key: "icp_fit", label: "ICP fit", max: 20 },
  { key: "capital", label: "Capital", max: 15 },
  { key: "talent_scarcity", label: "Talent scarcity", max: 15 },
  { key: "access", label: "Access", max: 10 },
  { key: "freshness", label: "Freshness", max: 10 },
];

const clamp = (n, max) => Math.max(0, Math.min(max, Math.round(n)));

/**
 * Days between a signal date and the day the scoring run happens.
 *
 * `asOf` is a required argument rather than a call to Date.now(): a scorer that
 * reads the clock produces a different answer on every run, which makes the
 * stored breakdown impossible to reconcile and the tests impossible to write.
 */
export function ageInDays(signalDate, asOf) {
  if (!signalDate || !asOf) return null;
  const a = new Date(signalDate);
  const b = new Date(asOf);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/* -------------------------------------------------------------------------
   Hiring urgency, out of 30

   The largest component, because a live requisition is the strongest reason to
   contact a recruiting client. Volume alone is not urgency: ten junior roles
   at a 2,000 person company is business as usual, while two senior openings at
   a 40 person company is a company that just changed shape. So the score is
   built from the roles that are actually ALAC-qualified, weighted by how
   senior they are and how recently they were posted.
   ---------------------------------------------------------------------- */
export function hiringUrgency({ jobs, asOf } = {}) {
  if (!Array.isArray(jobs)) return { value: null, terms: [], reason: "no job data fetched" };

  const terms = [];
  let points = 0;

  const qualified = jobs.filter((j) => j.qualified !== false);
  if (qualified.length === 0) {
    return { value: 0, terms: [{ term: "No qualified openings", points: 0, input: jobs.length }], reason: null };
  }

  // Volume, saturating. The eleventh opening does not mean more than the tenth.
  const volume = Math.min(qualified.length, 10) * 1.2;
  points += volume;
  terms.push({ term: "Qualified openings", points: Math.round(volume), input: qualified.length });

  // Seniority. A VP or C-level search is the one a firm gets paid for.
  const senior = qualified.filter((j) => j.seniority === "executive" || j.seniority === "vp").length;
  if (senior > 0) {
    const p = Math.min(senior * 3, 9);
    points += p;
    terms.push({ term: "Executive or VP searches", points: p, input: senior });
  }

  const director = qualified.filter((j) => j.seniority === "director").length;
  if (director > 0) {
    const p = Math.min(director * 1.5, 4);
    points += p;
    terms.push({ term: "Director searches", points: Math.round(p), input: director });
  }

  // Recency of the postings themselves. A req opened this week is live; one
  // from six months ago is either filled or stuck, and neither is a wedge.
  const fresh = qualified.filter((j) => {
    const age = ageInDays(j.posted_at, asOf);
    return age != null && age <= 30;
  }).length;
  if (fresh > 0) {
    const p = Math.min(fresh * 1.5, 6);
    points += p;
    terms.push({ term: "Posted in the last 30 days", points: Math.round(p), input: fresh });
  }

  return { value: clamp(points, 30), terms, reason: null };
}

/* -------------------------------------------------------------------------
   ICP fit, out of 20

   This one is mostly already answered. The Master TAM has finalized a priority
   and a score for every qualified account, so re-deriving fit from firmographics
   would be inventing a second opinion about a question the firm has already
   settled. The component reads the TAM instead.

   An account with no TAM record is the interesting case: it produced a signal
   before qualification caught up. It scores at the middle of the band rather
   than at zero, because zero would bury exactly the companies the board exists
   to surface.
   ---------------------------------------------------------------------- */
export function icpFit({ priority, finalScore } = {}) {
  const terms = [];

  if (!priority && finalScore == null) {
    return {
      value: 12,
      terms: [{ term: "Not in the scored TAM", points: 12, input: "unqualified" }],
      reason: null,
    };
  }

  const base = { priority_1: 20, priority_2: 14, priority_3: 8, unscored: 12 }[priority] ?? 10;
  terms.push({ term: "TAM priority", points: base, input: priority ?? "none" });

  return { value: clamp(base, 20), terms, reason: null };
}

/* -------------------------------------------------------------------------
   Capital, out of 15

   Money raised or won, on a log scale. The jump from 5M to 50M changes what a
   company can hire; the jump from 500M to 900M does not change it again by the
   same amount, so the scale compresses at the top.
   ---------------------------------------------------------------------- */
export function capital({ amountUsd, roundLabel } = {}) {
  if (amountUsd == null) {
    return { value: null, terms: [], reason: "no funding or contract amount known" };
  }
  if (amountUsd <= 0) {
    return { value: 0, terms: [{ term: "No disclosed amount", points: 0, input: amountUsd }], reason: null };
  }

  // log10(1M) = 6 scores 0, log10(1B) = 9 scores 15. Five points per decade.
  const decades = Math.log10(amountUsd) - 6;
  const points = clamp(decades * 5, 15);
  return {
    value: points,
    terms: [{ term: roundLabel ? `Raised, ${roundLabel}` : "Amount", points, input: amountUsd }],
    reason: null,
  };
}

/* -------------------------------------------------------------------------
   Talent scarcity, out of 15

   How hard the open roles are to fill, which is what the firm is actually paid
   for. Scored from the roles themselves rather than from a vendor's opinion:
   a cleared, senior or deep-specialist req is the one a company cannot fill
   from inbound.
   ---------------------------------------------------------------------- */
const SCARCE = [
  { re: /\b(clearance|cleared|ts\/sci|polygraph|secret)\b/i, label: "Requires a clearance", points: 6 },
  { re: /\b(gnc|guidance navigation|propulsion|rf |radar|avionics|cryogen|hypersonic)\b/i, label: "Deep aerospace specialism", points: 5 },
  { re: /\b(principal|staff|fellow|distinguished)\b/i, label: "Principal or staff level", points: 4 },
  { re: /\b(chief|vp |head of|director)\b/i, label: "Leadership hire", points: 3 },
];

export function talentScarcity({ jobs } = {}) {
  if (!Array.isArray(jobs)) return { value: null, terms: [], reason: "no job data fetched" };
  if (jobs.length === 0) {
    return { value: 0, terms: [{ term: "No open roles to assess", points: 0, input: 0 }], reason: null };
  }

  const terms = [];
  let points = 0;
  for (const { re, label, points: p } of SCARCE) {
    const hits = jobs.filter((j) => re.test(`${j.title ?? ""} ${j.description ?? ""}`)).length;
    if (hits > 0) {
      points += p;
      terms.push({ term: label, points: p, input: hits });
    }
  }

  if (terms.length === 0) {
    terms.push({ term: "No scarcity markers in the open roles", points: 0, input: jobs.length });
  }
  return { value: clamp(points, 15), terms, reason: null };
}

/* -------------------------------------------------------------------------
   Access, out of 10

   Whether this can be worked warm. This needs no vendor at all: the warm
   network is already matched to accounts in the people table, and a first
   degree connection to a decision maker is the shortest path there is.
   ---------------------------------------------------------------------- */
export function access({ warmContacts, decisionMakers } = {}) {
  if (warmContacts == null) return { value: null, terms: [], reason: "warm network not matched" };

  const terms = [];
  let points = 0;

  if (decisionMakers > 0) {
    const p = Math.min(decisionMakers * 4, 8);
    points += p;
    terms.push({ term: "Decision maker already known", points: p, input: decisionMakers });
  }

  const others = Math.max(0, warmContacts - (decisionMakers ?? 0));
  if (others > 0) {
    const p = Math.min(others, 4);
    points += p;
    terms.push({ term: "Other first degree contacts", points: p, input: others });
  }

  if (terms.length === 0) {
    terms.push({ term: "No warm path, starts cold", points: 0, input: 0 });
  }
  return { value: clamp(points, 10), terms, reason: null };
}

/* -------------------------------------------------------------------------
   Freshness, out of 10

   A decay, and the only component that needs nothing but a date. The workbook
   cuts signals at a 14 day ceiling, so the curve is built around that: full
   marks inside a week, half by two weeks, and effectively nothing after a
   month. A stale signal is not a wedge even when the company is right.
   ---------------------------------------------------------------------- */
export function freshness({ signalDate, asOf } = {}) {
  const age = ageInDays(signalDate, asOf);
  if (age == null) return { value: null, terms: [], reason: "no signal date" };
  if (age < 0) {
    // A future dated signal is a data error, not a very fresh signal.
    return { value: null, terms: [], reason: `signal dated ${Math.abs(age)} days in the future` };
  }

  let points;
  if (age <= 7) points = 10;
  else if (age <= 14) points = 7;
  else if (age <= 30) points = 4;
  else if (age <= 60) points = 2;
  else points = 0;

  return {
    value: points,
    terms: [{ term: `${age} days old`, points, input: age }],
    reason: null,
  };
}

/* -------------------------------------------------------------------------
   The composite
   ---------------------------------------------------------------------- */

/**
 * Score one signal.
 *
 * Returns the total, the six components, the terms behind each, and an honest
 * account of what could not be scored. `coverage` is the share of the 100
 * points that were actually assessable, so a 62 built from every component and
 * a 62 built from half of them are distinguishable on screen. Contract rule 11:
 * every claim shows its evidence.
 */
export function scoreHeat(input) {
  const asOf = input.asOf;

  const results = {
    hiring_urgency: hiringUrgency({ jobs: input.jobs, asOf }),
    icp_fit: icpFit({ priority: input.priority, finalScore: input.finalScore }),
    capital: capital({ amountUsd: input.amountUsd, roundLabel: input.roundLabel }),
    talent_scarcity: talentScarcity({ jobs: input.jobs }),
    access: access({ warmContacts: input.warmContacts, decisionMakers: input.decisionMakers }),
    freshness: freshness({ signalDate: input.signalDate, asOf }),
  };

  const components = {};
  const terms = [];
  const gaps = [];
  let total = 0;
  let assessable = 0;

  for (const { key, max } of COMPONENTS) {
    const r = results[key];
    components[key] = r.value;
    if (r.value == null) {
      gaps.push({ component: key, reason: r.reason });
      continue;
    }
    assessable += max;
    total += r.value;
    for (const t of r.terms) terms.push({ component: key, ...t });
  }

  return {
    heat_score: total,
    components,
    terms,
    gaps,
    // Rounded to a whole percent: this is shown as "scored on 85% of the model",
    // and a decimal there would imply a precision the coverage does not have.
    coverage: Math.round((assessable / 100) * 100),
  };
}

/**
 * Heat against the account's standing TAM score. The number the desk acts on:
 * positive means the signal has moved this company ahead of its qualification.
 * Null when there is no TAM score to compare against, which is itself the
 * signal that the TAM has not caught up with this company yet.
 */
export function heatVsTam(heatScore, tamFinalScore) {
  if (tamFinalScore == null) return null;
  const tam = Number(tamFinalScore);
  if (!Number.isFinite(tam)) return null;
  return Math.round(heatScore - tam);
}
