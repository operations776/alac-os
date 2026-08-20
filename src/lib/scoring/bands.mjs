// Which 25 to work now, which 25 next, and what sits in the backlog.
//
// Pure and deterministic, like the heat scorer, and for the same reason: the
// desk has to be able to ask "why is this company in Work Now" and get an
// answer rather than a shrug.
//
// The ordering question this settles: the master list already ranks companies
// by fit, and that ranking is stable for months at a time. What it cannot do is
// notice that one of them raised money last Tuesday. So the band is fit as the
// base, urgency as the mover, and reachability as the tiebreak.
//
// A company with no news does not fall off the board. It sits where its fit
// score puts it, which is the difference between "nothing happened" and "not
// worth working".

/** The three bands, in the order they are worked. */
export const BANDS = ["now", "next", "backlog"];

const PRIORITY_WEIGHT = {
  priority_1: 40,
  priority_2: 25,
  priority_3: 8,
  unscored: 20,
};

/**
 * A single 0 to 100 number for ordering the whole market.
 *
 * The weights answer one question: what makes a company worth a call this week
 * rather than next quarter.
 *
 *   fit        up to 55   where the master list already put them
 *   urgency    up to 30   something changed, and how recently
 *   reach      up to 15   you already know someone, so it starts warm
 *
 * Fit dominates because it is a considered judgement made with more context
 * than this app has. Urgency moves a company up but cannot rescue a poor fit,
 * which is deliberate: a badly fitting company that just raised money is still
 * a badly fitting company.
 */
export function workScore({
  priority,
  finalScore,
  heatScore,
  heatVsTam,
  warmContacts,
  decisionMakers,
  qualifiedRoles,
}) {
  const reasons = [];
  let score = 0;

  // Fit, from the master list.
  const pri = PRIORITY_WEIGHT[priority] ?? 10;
  const fit = finalScore != null ? Math.round((Number(finalScore) / 100) * 15) : 0;
  score += pri + fit;
  if (priority === "priority_1") reasons.push("Priority 1 on the master list");
  else if (priority === "unscored") reasons.push("Strategic account, not yet scored");

  // Urgency, from what changed.
  if (heatScore != null) {
    const h = Math.round((heatScore / 100) * 22);
    score += h;
    if (heatScore >= 60) reasons.push("Something significant just changed");
    else if (heatScore >= 35) reasons.push("Recent activity worth a look");
  }
  // Hotter than its standing rank is the interesting case: the master list has
  // not caught up with this company yet.
  if (heatVsTam != null && heatVsTam > 0) {
    score += Math.min(8, Math.round(heatVsTam / 3));
    reasons.push("More urgent than its rank suggests");
  }

  // Reach. A warm path is worth real points because it changes the odds of a
  // reply more than anything else on this list.
  if (decisionMakers > 0) {
    score += Math.min(10, decisionMakers * 4);
    reasons.push(
      decisionMakers === 1
        ? "You know a decision maker there"
        : `You know ${decisionMakers} decision makers there`,
    );
  } else if (warmContacts > 0) {
    score += Math.min(5, warmContacts);
    reasons.push(`You know ${warmContacts} ${warmContacts === 1 ? "person" : "people"} there`);
  }

  if (qualifiedRoles > 0) {
    reasons.push(`${qualifiedRoles} relevant ${qualifiedRoles === 1 ? "role" : "roles"} open`);
  }

  if (reasons.length === 0) reasons.push("On the master list, nothing new");

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Split a scored market into the three bands.
 *
 * Work Now and Up Next are fixed at 25 each because that is what the workbook's
 * own board does and what a person can actually hold in their head. Everything
 * else is the backlog, which is not a rejection: it is the list the next signal
 * promotes from.
 */
export function assignBands(rows, { nowSize = 25, nextSize = 25 } = {}) {
  const sorted = rows
    .slice()
    .sort((a, b) => (b.work_score ?? 0) - (a.work_score ?? 0) || a.company_name.localeCompare(b.company_name));

  return sorted.map((row, i) => ({
    ...row,
    work_band: i < nowSize ? "now" : i < nowSize + nextSize ? "next" : "backlog",
    rank: i + 1,
  }));
}
