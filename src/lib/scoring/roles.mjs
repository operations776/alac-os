// How commercially attractive one open role is, out of 100.
//
// Section 17.1 of the brief sets the model, and it inverts what a job board
// would do: "Core priority: recruiting difficulty x time open." A role that
// is hard to fill and has been open a long time is the commercially valuable
// one, because the employer has already failed to fill it themselves. An easy
// role that went up this morning is not a lead, it is a job posting.
//
// So difficulty leads, age compounds it, and the rest are modifiers. The
// brief is explicit about the downrank too: "If the role is low-value or
// easy-to-fill, downrank it even if it is industry-relevant."
//
// Every function here returns its reasons alongside its number, because
// section 4 requires every score to carry a why, its supporting facts and
// its freshness. A number nobody can interrogate is a number nobody trusts.

const daysAgo = (d, asOf) =>
  d ? Math.floor((new Date(asOf ?? Date.now()).getTime() - new Date(d).getTime()) / 86_400_000) : null;

/**
 * How hard this role is to fill, out of 100, and why.
 *
 * Scarcity is what an agency is paid for, so it is read from the things that
 * actually narrow a candidate pool: clearance, seniority, and a specialism
 * that takes years rather than months to acquire.
 */
export function difficulty(title = "", extra = {}) {
  const t = `${title} ${extra.occupation ?? ""}`.toLowerCase();
  const terms = [];
  let d = 30;
  terms.push({ term: "Base difficulty", points: 30, input: "every professional role" });

  // Clearance is the hardest constraint in defence hiring: it cannot be
  // trained for and it cannot be hired around.
  if (/\btssci|ts\/sci|top secret\b/.test(t)) {
    d += 30;
    terms.push({ term: "Top Secret clearance", points: 30, input: "cannot be trained for, cannot be hired around" });
  } else if (/\bpoly(graph)?\b/.test(t)) {
    d += 26;
    terms.push({ term: "Polygraph required", points: 26, input: "a very small cleared pool" });
  } else if (/\bclearance|cleared|secret\b/.test(t)) {
    d += 22;
    terms.push({ term: "Clearance required", points: 22, input: "only cleared candidates apply" });
  }

  // Seniority. A director is a smaller pool than a mid level engineer, and an
  // executive smaller still.
  if (/\bchief|vp\b|vice president|head of\b/.test(t)) {
    d += 20;
    terms.push({ term: "Executive level", points: 20, input: "smallest pool, longest search" });
  } else if (/\bdirector|principal\b/.test(t)) {
    d += 16;
    terms.push({ term: "Director or principal", points: 16, input: "senior, hard to source cold" });
  } else if (/\bstaff|senior|sr\.|lead\b/.test(t)) {
    d += 10;
    terms.push({ term: "Senior level", points: 10, input: "experienced hire" });
  } else if (/\bjunior|associate|entry\b/.test(t)) {
    d -= 12;
    terms.push({ term: "Junior level", points: -12, input: "the client can fill this themselves" });
  }

  // Specialisms where the training pipeline is genuinely narrow.
  if (/\bguidance|navigation|gnc\b|flight software|avionics|propulsion|rf\b|radar|electronic warfare|ew\b|hypersonic|cryptograph|autonomy|embedded/.test(t)) {
    d += 18;
    terms.push({ term: "Scarce specialism", points: 18, input: "years of training, few people hold it" });
  } else if (/\bmechanical|electrical|systems engineer|manufacturing|structures\b/.test(t)) {
    d += 8;
    terms.push({ term: "Engineering discipline", points: 8, input: "a real skill, a wider pool" });
  }

  // Roles a client can fill without an agency, whatever the industry.
  if (/\brecruit|sales development|sdr\b|customer support|data entry|intern/.test(t)) {
    d -= 20;
    terms.push({ term: "Fills itself", points: -20, input: "no agency needed for this" });
  }

  return { value: Math.max(0, Math.min(100, d)), terms };
}

/**
 * Time open, out of 100, and why. A role open six weeks has beaten the
 * employer's own pipeline, which is exactly when an agency call lands.
 *
 * first_seen is when the posting entered our feed, which understates true age
 * on the first pull and is honest from then on.
 */
export function aging(firstSeen, asOf) {
  const age = daysAgo(firstSeen, asOf);
  if (age === null) {
    return { value: 20, age: null, terms: [{ term: "No posting date", points: 20, input: "assumed recent" }] };
  }
  const bands = [
    [90, 100, "Open over 90 days", "their pipeline has clearly failed"],
    [60, 88, "Open over 60 days", "two months of trying without a hire"],
    [45, 78, "Open over 45 days", "past the point most roles fill"],
    [30, 66, "Open over a month", "the internal team has not solved it"],
    [21, 52, "Open three weeks", "starting to stall"],
    [14, 40, "Open two weeks", "still early"],
    [7, 26, "Open a week", "recent"],
    [0, 12, "Just posted", "nobody has struggled with it yet"],
  ];
  const [, points, term, input] = bands.find(([floor]) => age >= floor);
  return { value: points, age, terms: [{ term: `${term}, ${age} days`, points, input }] };
}

/**
 * The commercial score, out of 100, with every term that produced it.
 *
 * difficulty x time open is the core, per the brief, and it is a product
 * rather than a sum on purpose: an easy role open for a year is still easy,
 * and a hard role posted this morning has not yet proven the client cannot
 * fill it. Both terms have to be present for the lead to be strong.
 */
export function scoreRole(r, asOf) {
  const d = difficulty(r.title, { occupation: r.occupation });
  const a = aging(r.first_seen, asOf);

  // The core, worth up to 70. Normalised so the product does not collapse.
  const core = Math.round(((d.value * a.value) / 100) * 0.7);

  // The difficulty and age terms explain how those two numbers were reached,
  // but they are inputs to the core rather than points in the total. They are
  // marked `input: true` so the panel can show the reasoning without adding
  // them up: only the core and the modifiers below carry points.
  const terms = [
    ...d.terms.map((t) => ({ ...t, of: "difficulty", reason: true })),
    ...a.terms.map((t) => ({ ...t, of: "age", reason: true })),
    {
      term: "Difficulty times time open",
      points: core,
      input: `${d.value} hard, ${a.value} aged, worth up to 70`,
      core: true,
    },
  ];

  const t = String(r.title ?? "").toLowerCase();

  let fit = 4;
  let fitTerm = "Outside the core disciplines";
  if (/engineer|engineering|scientist|architect|technician/.test(t)) {
    fit = 12; fitTerm = "Engineering, what ALAC places";
  } else if (/security|clearance|classified/.test(t)) {
    fit = 11; fitTerm = "Cleared work, what ALAC places";
  } else if (/program|product|manufacturing|operations|quality|capture|business development/.test(t)) {
    fit = 10; fitTerm = "Program or commercial, adjacent";
  }
  terms.push({ term: fitTerm, points: fit, input: "discipline fit" });

  // A published band means a candidate conversation can start without a
  // discovery call about money, and a high band means a larger fee.
  const salary = r.salary || r.salary_text;
  let money = 0;
  if (salary) {
    money = 6;
    const nums = String(salary).match(/\d[\d,]{4,}/g);
    const top = nums ? Math.max(...nums.map((n) => Number(n.replace(/,/g, "")))) : 0;
    if (top >= 200_000) money = 12;
    else if (top >= 150_000) money = 9;
    terms.push({
      term: money >= 9 ? "High published salary" : "Salary published",
      points: money,
      input: String(salary).slice(0, 40),
    });
  }

  // A company hiring several hard roles at once has a systemic problem, which
  // is a better conversation than a single opening.
  const cluster = Number(r.open_at_company ?? 0) >= 5 ? 6 : 0;
  if (cluster) {
    terms.push({
      term: "Hiring several roles at once",
      points: 6,
      input: `${r.open_at_company} open here`,
    });
  }

  return {
    value: Math.max(0, Math.min(100, core + fit + money + cluster)),
    difficulty: d.value,
    age: a.age,
    terms,
  };
}

/** The number alone, for callers that only store it. */
export function roleScore(r, asOf) {
  return scoreRole(r, asOf).value;
}

/** One sentence for a list, where a full breakdown does not fit. */
export function explainRole(r, asOf) {
  const s = scoreRole(r, asOf);
  const parts = [];
  parts.push(s.difficulty >= 70 ? "Hard to fill" : s.difficulty >= 50 ? "Moderately hard" : "Straightforward to fill");
  if (s.age !== null) {
    parts.push(
      s.age >= 60 ? `open ${s.age} days, their own pipeline has failed`
        : s.age >= 30 ? `open ${s.age} days`
        : s.age >= 14 ? `open ${s.age} days`
        : "posted recently",
    );
  }
  if (r.salary_text || r.salary) parts.push("salary published");
  return parts.join(", ");
}
