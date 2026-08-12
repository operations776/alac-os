// The deterministic score. A pure function: same inputs, same number, always.
//
// The model never produces this score, it only explains it. That split is
// deliberate. Arithmetic lives somewhere that cannot hallucinate, runs over
// thousands of accounts in seconds for nothing, and works with no API key.
//
// Five components sum to 100, then penalties subtract. Every term records what
// it read, what it was worth, and what it contributed, so the UI can show why
// a number is what it is rather than asking anyone to trust it.

const ICP_VERTICALS = [
  "defense", "aerospace", "space", "autonom", "robotic", "ai", "machine learning",
  "cyber", "deep tech", "directed energy", "uas", "drone", "advanced manufacturing",
  "satellite", "propulsion", "avionics", "semiconductor",
];

// Stated hotspots. A match is worth points because proximity closes deals.
const ICP_STATES = [
  "california", "washington", "colorado", "texas", "alabama", "florida",
  "virginia", "maryland", "district of columbia", "massachusetts",
  "pennsylvania", "north carolina", "arizona",
];

// Roles the firm actually fills. A company hiring these is a better fit than
// one hiring the same number of unrelated roles.
const ICP_ROLE_TERMS = [
  "rf", "electronic warfare", "gnc", "guidance", "autonomy", "perception",
  "slam", "computer vision", "sensor fusion", "embedded", "flight software",
  "firmware", "cleared", "clearance", "propulsion", "avionics", "payload",
  "signal processing", "fpga", "pcb", "systems engineer", "mbse",
];

function includesAny(haystack, needles) {
  if (!haystack) return false;
  const s = String(haystack).toLowerCase();
  return needles.some((n) => s.includes(n));
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const then = new Date(dateLike);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

/**
 * @param {object} a account row
 * @param {object} [focus] current quarter focus: { verticals: string[], states: string[] }
 * @returns {{score:number, components:object, penalty:number, breakdown:object}}
 */
export function computeScore(a, focus = {}) {
  const terms = [];
  const add = (component, term, input, points, note) => {
    terms.push({ component, term, input, points, note });
    return points;
  };

  // ---- ICP fit, 25 ------------------------------------------------------
  let icp = 0;
  const verdict = a.defense_verdict;
  icp += add("icp_fit", "defense_verdict", verdict ?? "unknown",
    verdict === "FIT" ? 10 : verdict === "MAYBE" ? 5 : 0,
    "Defense alignment is the entry requirement");

  const verticalHit = includesAny(a.vertical, ICP_VERTICALS) || includesAny(a.keyword_tags?.join(" "), ICP_VERTICALS);
  icp += add("icp_fit", "vertical", a.vertical ?? "unknown", verticalHit ? 6 : 0,
    verticalHit ? "In a target vertical" : "Outside the target verticals");

  // Sweet spot is a company big enough to pay a fee and small enough to lack
  // an internal recruiting team.
  const mid = a.employee_midpoint;
  const bandPoints = mid == null ? 1 : mid >= 21 && mid <= 100 ? 5 : mid >= 11 && mid <= 200 ? 4 : mid <= 500 ? 3 : 1;
  icp += add("icp_fit", "employee_band", a.employee_band ?? "unknown", bandPoints,
    mid != null && mid >= 21 && mid <= 100 ? "In the stated sweet spot" : "Outside the sweet spot");

  const stateHit = includesAny(a.hq_state, ICP_STATES) || includesAny(a.hq_location, ICP_STATES);
  icp += add("icp_fit", "geography", a.hq_state ?? a.hq_location ?? "unknown", stateHit ? 4 : 0,
    stateHit ? "In a hotspot" : "Outside the hotspots");

  // The quarterly thesis feeds back into scoring here. Editing the quarter
  // re-orders the portfolio, which is what makes the rhythm real rather than
  // decorative. Capped so it tilts rather than dominates.
  let focusBonus = 0;
  if (focus.verticals?.length && includesAny(a.vertical, focus.verticals.map((v) => v.toLowerCase()))) focusBonus += 3;
  if (focus.states?.length && includesAny(a.hq_state, focus.states.map((s) => s.toLowerCase()))) focusBonus += 2;
  if (focusBonus) add("icp_fit", "quarter_focus", "current quarter", focusBonus, "Matches this quarter's focus");
  icp = Math.min(25, icp + focusBonus);

  // ---- Hiring signal, 25 -----------------------------------------------
  const roles = a.open_roles_count ?? 0;
  // Banded, not linear: a 520-role prime contractor is a different business,
  // not a better prospect than a 12-role startup.
  const rolePoints = roles === 0 ? 0 : roles <= 2 ? 12 : roles <= 5 ? 18 : roles <= 15 ? 22 : 25;
  let hiring = add("hiring", "open_roles", roles, rolePoints,
    roles === 0 ? "No open roles found" : `${roles} open role${roles === 1 ? "" : "s"}`);

  const roleTermHit = includesAny(a.keyword_tags?.join(" "), ICP_ROLE_TERMS) || includesAny(a.description, ICP_ROLE_TERMS);
  if (roles > 0 && roleTermHit) {
    hiring += add("hiring", "role_relevance", "keyword match", 3, "Hiring the kinds of roles this firm fills");
  }
  hiring = Math.min(25, hiring);

  // ---- Timing, 20 -------------------------------------------------------
  const fundingAge = daysSince(a.last_funding_date);
  let recency = 0;
  if (fundingAge != null) {
    recency = fundingAge <= 90 ? 20 : fundingAge <= 180 ? 16 : fundingAge <= 365 ? 12 : fundingAge <= 730 ? 6 : 0;
  }
  // A late-stage or debt round does not create the same urgent hiring need for
  // a boutique agency as an early priced round.
  const stage = (a.funding_stage || "").toLowerCase();
  const lateStage = /series [d-z]|private equity|post-ipo|debt|grant|secondary/.test(stage);
  const stageFactor = lateStage ? 0.6 : 1;
  const timing = Math.min(20, Math.round(recency * stageFactor));
  add("timing", "funding_recency", a.last_funding_date ? `${fundingAge}d ago` : "no funding date", timing,
    fundingAge == null ? "No dated round" : lateStage ? "Recent but late stage" : "Recency of the last round");

  // ---- Relationship, 15 -------------------------------------------------
  let rel = 0;
  const warm = a.warm_contact_count ?? 0;
  if (warm > 0) rel += add("relationship", "warm_contacts", warm, 6, "First degree contact at this account");
  if (a.has_decision_maker) rel += add("relationship", "decision_maker", "yes", 5, "A decision maker is in the network");

  const connAge = daysSince(a.most_recent_connection);
  if (connAge != null) {
    const connPoints = connAge <= 365 ? 4 : connAge <= 730 ? 2 : 0;
    if (connPoints) rel += add("relationship", "connection_recency", `${connAge}d`, connPoints, "Recently connected");
  }
  if (a.on_existing_list) {
    rel = 15;
    add("relationship", "existing_relationship", "yes", 15, "Existing relationship, overrides the component");
  }
  rel = Math.min(15, rel);

  // ---- Revenue potential, 15 -------------------------------------------
  const volume = Math.min(10, roles);
  const capacity = mid == null ? 0 : mid >= 200 ? 3 : mid >= 50 ? 2 : 1;
  const warChest = (a.total_funding_usd ?? 0) >= 50_000_000 ? 2 : (a.total_funding_usd ?? 0) >= 10_000_000 ? 1 : 0;
  const revenue = Math.min(15, volume + capacity + warChest);
  add("revenue", "role_volume", roles, volume, "Placements available now");
  add("revenue", "headcount_capacity", a.employee_band ?? "unknown", capacity, "Capacity to keep hiring");
  add("revenue", "war_chest", a.total_funding_usd ?? 0, warChest, "Ability to pay agency fees");

  // ---- Penalties --------------------------------------------------------
  let penalty = 0;
  if (!a.norm_domain && !a.linkedin_url) {
    penalty += add("penalty", "unactionable", "no domain or LinkedIn", 5, "Nothing to act on");
  }
  if (verdict === "MAYBE" && roles === 0 && !a.last_funding_date) {
    penalty += add("penalty", "list_filler", "no signal at all", 10, "Weak fit with no supporting signal");
  }
  const age = a.founded_year ? new Date().getFullYear() - a.founded_year : null;
  if (age != null && age <= 1 && (mid ?? 0) < 11) {
    penalty += add("penalty", "too_early", `founded ${a.founded_year}`, 5, "Likely too early to pay agency fees");
  }

  const raw = icp + hiring + timing + rel + revenue;
  const score = Math.max(0, Math.min(100, raw - penalty));

  return {
    score,
    components: {
      icp_fit_score: icp,
      hiring_signal_score: hiring,
      timing_score: timing,
      relationship_score: rel,
      revenue_potential_score: revenue,
    },
    penalty,
    breakdown: { terms, raw, penalty, final: score, scored_on: new Date().toISOString().slice(0, 10) },
  };
}

/**
 * Tier from rank, with hysteresis applied by the caller. Pure boundaries here.
 */
export function tierForRank(rank) {
  if (rank <= 25) return "top25";
  if (rank <= 50) return "next25";
  if (rank <= 150) return "watch";
  return "unassigned";
}
