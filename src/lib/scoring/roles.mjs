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
// Stored on the row as `relevance` and recomputed on every pull, because age
// moves every day.

const daysAgo = (d, asOf) =>
  d ? Math.floor((new Date(asOf ?? Date.now()).getTime() - new Date(d).getTime()) / 86_400_000) : null;

/**
 * How hard this role is to fill, out of 100. The single largest input.
 *
 * Scarcity is what an agency is paid for, so it is read from the things that
 * actually narrow a candidate pool: clearance, seniority, and a specialism
 * that takes years rather than months to acquire.
 */
export function difficulty(title = "", extra = {}) {
  const t = `${title} ${extra.occupation ?? ""}`.toLowerCase();
  let d = 30;

  // Clearance is the hardest constraint in defence hiring: it cannot be
  // trained for and it cannot be hired around.
  if (/\btssci|ts\/sci|top secret\b/.test(t)) d += 30;
  else if (/\bclearance|cleared|secret\b/.test(t)) d += 22;
  else if (/\bpoly(graph)?\b/.test(t)) d += 26;

  // Seniority. A director is a smaller pool than a mid level engineer, and an
  // executive smaller still.
  if (/\bchief|vp\b|vice president|head of\b/.test(t)) d += 20;
  else if (/\bdirector|principal\b/.test(t)) d += 16;
  else if (/\bstaff|senior|sr\.|lead\b/.test(t)) d += 10;
  else if (/\bjunior|associate|entry\b/.test(t)) d -= 12;

  // Specialisms where the training pipeline is genuinely narrow.
  if (/\bguidance|navigation|gnc\b|flight software|avionics|propulsion|rf\b|radar|electronic warfare|ew\b|hypersonic|cryptograph|autonomy|embedded/.test(t)) d += 18;
  else if (/\bmechanical|electrical|systems engineer|manufacturing|structures\b/.test(t)) d += 8;

  // Roles a client can fill without an agency, whatever the industry.
  if (/\brecruit|sales development|sdr\b|customer support|data entry|intern/.test(t)) d -= 20;

  return Math.max(0, Math.min(100, d));
}

/**
 * Time open, out of 100. A role open six weeks has beaten the employer's own
 * pipeline, which is exactly when an agency call lands.
 *
 * first_seen is when the posting entered our feed, which understates true age
 * on the first pull and is honest from then on.
 */
export function aging(firstSeen, asOf) {
  const age = daysAgo(firstSeen, asOf);
  if (age === null) return 20;
  if (age >= 90) return 100;
  if (age >= 60) return 88;
  if (age >= 45) return 78;
  if (age >= 30) return 66;
  if (age >= 21) return 52;
  if (age >= 14) return 40;
  if (age >= 7) return 26;
  return 12;
}

/**
 * The commercial score, out of 100.
 *
 * difficulty x time open is the core, per the brief, and it is a product
 * rather than a sum on purpose: an easy role open for a year is still easy,
 * and a hard role posted this morning has not yet proven the client cannot
 * fill it. Both terms have to be present for the lead to be strong.
 */
export function roleScore(r, asOf) {
  const d = difficulty(r.title, { occupation: r.occupation });
  const a = aging(r.first_seen, asOf);

  // The core, worth up to 70. Normalised so the product does not collapse:
  // 100 x 100 / 100 = 100, scaled to 70.
  const core = Math.round(((d * a) / 100) * 0.7);

  // Modifiers, worth up to 30 between them. These describe the role rather
  // than the opportunity, so they adjust rather than decide.
  const t = String(r.title ?? "").toLowerCase();

  let fit = 0;
  if (/engineer|engineering|scientist|architect|technician/.test(t)) fit = 12;
  else if (/program|product|manufacturing|operations|quality|capture|business development/.test(t)) fit = 10;
  else if (/security|clearance|classified/.test(t)) fit = 11;
  else fit = 4;

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
  }

  // A company hiring several hard roles at once has a systemic problem, which
  // is a better conversation than a single opening.
  const cluster = Number(r.open_at_company ?? 0) >= 5 ? 6 : 0;

  return Math.max(0, Math.min(100, core + fit + money + cluster));
}

/** Why the score is what it is, in words, for the screen. */
export function explainRole(r, asOf) {
  const d = difficulty(r.title, { occupation: r.occupation });
  const age = daysAgo(r.first_seen, asOf);
  const parts = [];
  parts.push(d >= 70 ? "Hard to fill" : d >= 50 ? "Moderately hard" : "Straightforward to fill");
  if (age !== null) {
    parts.push(
      age >= 60 ? `open ${age} days, their own pipeline has failed`
        : age >= 30 ? `open ${age} days`
        : age >= 14 ? `open ${age} days`
        : "posted recently",
    );
  }
  if (r.salary_text || r.salary) parts.push("salary published");
  return parts.join(", ");
}
