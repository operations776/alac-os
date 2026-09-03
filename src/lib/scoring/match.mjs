// The Match Engine. Demand x Talent, section 20 of the brief.
//
// Given a candidate profile, score every requisition we already hold. The
// rule that shapes the whole thing is section 21.1: never stop at zero. If
// there is no exact match, the screen still has to show adjacent roles,
// companies whose signals imply a need, and strategic accounts. MPC marketing
// creates demand rather than waiting for a perfect requisition.
//
// Deterministic and pure, like every other scorer here, so a producer can ask
// why a role appeared and get an answer rather than a shrug.

/** Words that mean the same job to a recruiter and different things to a string compare. */
const SYNONYMS = [
  ["bd", "business development", "growth", "capture", "sales"],
  ["uas", "uav", "drone", "unmanned", "loitering munition"],
  ["gnc", "guidance navigation control", "guidance", "navigation"],
  ["ew", "electronic warfare", "rf", "spectrum"],
  ["isr", "surveillance", "reconnaissance", "intelligence"],
  ["sw", "software", "swe"],
  ["me", "mechanical"],
  ["ee", "electrical"],
  ["pm", "program manager", "program management", "programme"],
  ["navy", "naval", "navsea", "navair", "maritime", "usmc", "marine corps"],
  ["space", "satellite", "orbital", "launch"],
  ["vp", "vice president"],
  ["dir", "director"],
  ["sr", "senior"],
];

const STOP = new Set([
  "the", "and", "for", "with", "a", "an", "of", "in", "on", "at", "to", "or",
  "is", "are", "role", "roles", "job", "jobs", "open", "position", "positions",
  "looking", "who", "that", "this", "candidate", "someone", "find", "me", "any",
]);

/** Lowercase words, minus noise, plus every synonym of every word found. */
export function tokens(text = "") {
  const raw = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#/ -]/g, " ")
    .split(/[\s/-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

  const out = new Set(raw);
  for (const group of SYNONYMS) {
    if (raw.some((w) => group.includes(w)) || group.some((g) => g.includes(" ") && String(text).toLowerCase().includes(g))) {
      for (const g of group) out.add(g);
    }
  }
  return out;
}

// Every alternative carries its own word boundaries. A leading \b binds only
// to the first branch, so /\bchief|cto|.../ matched "cto" unanchored inside
// "director" and read every director in the corpus as an executive.
const LEVELS = [
  { key: "executive", rank: 5, re: /\b(chief|cto|ceo|coo|cro|president|evp)\b/ },
  { key: "vp", rank: 4, re: /\b(vp|vice president|head of)\b/ },
  { key: "director", rank: 3, re: /\b(director|principal)\b/ },
  { key: "manager", rank: 2, re: /\b(manager|lead|staff|senior|sr\.?)\b/ },
  { key: "ic", rank: 1, re: /.*/ },
];

export function levelOf(text = "") {
  const t = String(text).toLowerCase();
  return LEVELS.find((l) => l.re.test(t)) ?? LEVELS[4];
}

/**
 * How well one role fits one candidate, out of 100, with the reasons.
 *
 * Function and domain carry the most weight because they are what makes a
 * candidate credible in the room. Level is next, and it is scored as a
 * distance rather than a match: one step either way is still a real
 * conversation, two steps is not.
 */
/**
 * The job somebody actually does, as opposed to the market they do it in.
 *
 * This exists because customer words are not function words. An undersea
 * autonomy engineer and a USMC business development lead share "navy",
 * "marine corps" and "maritime", and on token overlap alone that scored 85%:
 * a false match, and the kind that destroys trust in the whole screen. So
 * function is checked separately and a mismatch caps the score, whatever the
 * domain words say.
 */
const FUNCTIONS = [
  { key: "commercial", re: /\b(business development|bd|sales|capture|growth|revenue|account executive|partnerships)\b/i },
  { key: "engineering", re: /\b(engineer|engineering|scientist|architect|developer|software|hardware|avionics|gnc|autonomy|propulsion|structures|firmware|embedded)\b/i },
  { key: "programs", re: /\b(program manager|programme|program management|project manager|pmo|earned value)\b/i },
  { key: "manufacturing", re: /\b(manufacturing|production|assembly|machinist|fabrication|supply chain|quality|industrial)\b/i },
  { key: "talent", re: /\b(recruit|talent|people|human resources|hr)\b/i },
  { key: "finance", re: /\b(finance|accounting|controller|fp&a|treasury)\b/i },
  { key: "legal", re: /\b(legal|counsel|contracts|compliance|itar|export)\b/i },
];

export function functionOf(text = "") {
  const t = String(text);
  for (const f of FUNCTIONS) if (f.re.test(t)) return f.key;
  return null;
}

export function matchRole(candidate, role) {
  const why = [];
  const cTok = candidate.tokens ?? tokens(`${candidate.title ?? ""} ${candidate.summary ?? ""} ${candidate.domains ?? ""}`);
  const rTok = tokens(`${role.title ?? ""} ${role.occupation ?? ""} ${role.job_function ?? ""}`);

  // Function first, from the titles alone. A summary mentions every customer
  // and programme somebody has touched, so it cannot decide what they do.
  const cFn = functionOf(candidate.title ?? "");
  const rFn = functionOf(`${role.title ?? ""} ${role.occupation ?? ""}`);
  const sameFunction = cFn && rFn ? cFn === rFn : null;

  let overlap = 0;
  for (const w of rTok) if (cTok.has(w)) overlap += 1;
  const denom = Math.max(3, Math.min(rTok.size, 10));
  let fn = Math.min(45, Math.round((overlap / denom) * 45));

  if (sameFunction === false) {
    // Shared market, different job. Kept as a real but weak signal, so it can
    // still surface as adjacent where the operator may see an angle.
    fn = Math.min(fn, 12);
    why.push(`Same market, different function: they are ${cFn}, this is ${rFn}`);
  } else if (sameFunction === true && fn >= 20) {
    why.push(`Same function, ${rFn}`);
  } else if (fn >= 30) {
    why.push("Same function and domain language");
  } else if (fn >= 15) {
    why.push("Related function");
  }

  const cl = levelOf(candidate.title ?? "");
  const rl = levelOf(role.title ?? "");
  const gap = Math.abs(cl.rank - rl.rank);
  const level = gap === 0 ? 25 : gap === 1 ? 16 : gap === 2 ? 6 : 0;
  if (gap === 0) why.push(`Same level, ${rl.key}`);
  else if (gap === 1) why.push(`One level ${rl.rank > cl.rank ? "up" : "down"}`);

  // Geography. A match is a bonus, a mismatch is not fatal: relocation and
  // remote both exist, and the producer decides.
  let geo = 0;
  const cGeo = String(candidate.geography ?? "").toLowerCase();
  const rGeo = String(role.location ?? "").toLowerCase();
  if (cGeo && rGeo) {
    const cWords = cGeo.split(/[\s,]+/).filter((w) => w.length > 2);
    if (cWords.some((w) => rGeo.includes(w))) { geo = 15; why.push("In their target geography"); }
    else if (/remote/.test(rGeo)) { geo = 10; why.push("Remote"); }
    else geo = 0;
  }

  // The commercial quality of the role itself, so a strong candidate is
  // pointed at the roles worth working rather than every role they could do.
  const commercial = Math.round(((role.relevance ?? 40) / 100) * 15);

  const score = Math.max(0, Math.min(100, fn + level + geo + commercial));

  // Hard constraints are reported, never silently applied. The brief asks for
  // "any hard constraint or uncertainty" on every result.
  const flags = [];
  const rt = `${role.title ?? ""} ${role.occupation ?? ""}`.toLowerCase();
  if (/clearance|cleared|ts\/sci|secret/.test(rt) && !candidate.clearance) {
    flags.push("Needs a clearance and none is recorded");
  }
  if (gap >= 2) flags.push(`Level gap: they are ${cl.key}, this is ${rl.key}`);
  if (cGeo && rGeo && geo === 0) flags.push(`Location: ${role.location}`);

  return { score, why, flags };
}

/** Where a scored role belongs on screen. Section 21.1. */
export function bucketFor(score, hasSignal) {
  if (score >= 65) return "exact";
  if (score >= 40) return "adjacent";
  return hasSignal ? "implied" : null;
}

/**
 * Split scored roles into the brief's four buckets, and never return nothing.
 *
 * Exact and adjacent come from the requisitions. Implied demand and strategic
 * targets come from accounts, which is what keeps the screen useful when the
 * market has no matching posting today.
 */
export function bucketResults(scored, accounts, { limit = 12 } = {}) {
  const exact = [], adjacent = [];
  for (const r of scored) {
    if (r.match.score >= 65) exact.push(r);
    else if (r.match.score >= 40) adjacent.push(r);
  }
  const named = new Set([...exact, ...adjacent].map((r) => r.account_id));

  // Implied demand: a company with a recent signal and no matching posting.
  // The signal is the reason to believe the need exists anyway.
  const implied = accounts
    .filter((a) => !named.has(a.id) && a.signal_text && a.heat_score != null)
    .sort((x, y) => (y.heat_score ?? 0) - (x.heat_score ?? 0))
    .slice(0, limit);

  const impliedIds = new Set(implied.map((a) => a.id));
  // Strategic: top of the working list, no posting, no signal. The MPC is the
  // reason to call, not the requisition.
  const strategic = accounts
    .filter((a) => !named.has(a.id) && !impliedIds.has(a.id) && a.work_band === "now")
    .sort((x, y) => (y.work_score ?? 0) - (x.work_score ?? 0))
    .slice(0, limit);

  return {
    exact: exact.slice(0, limit),
    adjacent: adjacent.slice(0, limit),
    implied,
    strategic,
  };
}

/**
 * Read a natural-language search into structured filters.
 *
 * "Director Navy BD in UAS, DMV" becomes a level, a customer, a function and
 * a geography. Deliberately a small dictionary rather than a model call: it
 * is free, instant, explainable, and wrong in ways a producer can see and
 * correct. The brief asks for owner refinement regardless of what the
 * classifier decided.
 */
const PLACES = {
  dmv: "washington", dc: "washington", "washington dc": "washington",
  socal: "california", "southern california": "california", norcal: "california",
  bay: "california", "bay area": "california", la: "california",
  colorado: "colorado", denver: "colorado", "colorado springs": "colorado",
  huntsville: "alabama", texas: "texas", austin: "texas", dallas: "texas",
  seattle: "washington", boston: "massachusetts", florida: "florida",
  virginia: "virginia", maryland: "maryland", remote: "remote",
};

export function parseQuery(q = "") {
  const text = String(q).toLowerCase();
  const out = { title: q, level: null, geography: null, minScore: null, minAge: null };

  const lvl = LEVELS.find((l) => l.key !== "ic" && l.re.test(text));
  if (lvl) out.level = lvl.key;

  for (const [word, place] of Object.entries(PLACES)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) { out.geography = place; break; }
  }

  const pct = text.match(/(\d{2,3})\s*%\+?/);
  if (pct) out.minScore = Math.min(100, Number(pct[1]));

  const days = text.match(/(\d{1,3})\+?\s*days?/);
  if (days) out.minAge = Number(days[1]);

  return out;
}
