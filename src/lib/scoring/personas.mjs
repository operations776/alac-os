// The six organizational levels, section 14 of the brief.
//
// The point of separating them is stated in his example: a CEO attempted
// twice with no response, while engineering roles are live and technical
// leadership has never been contacted, means the next move is the VP of
// Engineering. That is only computable if the levels are tracked apart from
// each other rather than as one "have we contacted them" flag.
//
// Order matters. A title is tested against each lane in turn and the first
// match wins, so the more specific lanes come first: "Head of Talent" is
// People, not Functional executive, even though both match on "head of".

export const LANES = [
  {
    key: "talent",
    label: "People and Talent",
    hint: "CHRO, VP People, Head of Talent, TA",
    // "people" on its own is the People function: VP People, Head of People,
    // People Operations. It is not a word that appears in other job titles.
    re: /\b(chro|talent|recruit|people|human resources|hr)\b/i,
  },
  {
    key: "hiring_manager",
    label: "Hiring manager",
    hint: "The manager the role reports to",
    re: /\b(engineering manager|manager,|manager of|team lead|hiring manager)\b/i,
  },
  {
    key: "hiring_leader",
    label: "Direct hiring leader",
    hint: "Director, Program, Department head",
    re: /\b(director|program lead|department head|head of engineering|head of production)\b/i,
  },
  {
    key: "functional",
    label: "Technical and functional",
    hint: "CTO, VP Engineering, Chief Engineer",
    re: /\b(cto|chief technology|chief engineer|chief scientist|vp engineering|vice president|svp|evp|head of)\b/i,
  },
  {
    key: "executive",
    label: "Executive",
    hint: "Founder, CEO, President",
    re: /\b(ceo|chief executive|founder|president|coo|chief operating|chief of staff|owner)\b/i,
  },
];

export const CONNECTOR = {
  key: "connector",
  label: "Warm connector",
  hint: "Someone who can introduce you",
};

/** Which lane a person belongs to. Never null: an unclassified title is an IC. */
export function laneOf(title = "") {
  const t = String(title ?? "");
  for (const lane of LANES) if (lane.re.test(t)) return lane.key;
  return null;
}

/** The four states a lane can be in. Section 14. */
export const TOUCH = ["Untouched", "Attempted", "Engaged", "Closed"];

/**
 * The next lane to approach, and why.
 *
 * The rule the brief describes: prefer an untouched lane over one that has
 * already been attempted, and weight the lanes by what the account's live
 * roles imply. Engineering roles open means technical leadership is the
 * right door; a hiring pain with no specific roles means Talent.
 *
 * Returns null when every lane is engaged or closed, because at that point
 * the account is in a conversation and does not need a cold route.
 */
export function nextLane({ lanes, freshRoles = 0, roleTitles = [] }) {
  const state = (k) => lanes?.[k]?.status ?? "Untouched";
  const has = (k) => (lanes?.[k]?.people ?? 0) > 0;

  // What the open roles say about which door to knock on.
  const titles = roleTitles.join(" ").toLowerCase();
  const technical = /engineer|scientist|architect|software|hardware|avionics|gnc/.test(titles);
  const commercial = /business development|sales|capture|growth|program/.test(titles);

  // Preference order, most likely to open the conversation first.
  const order = freshRoles > 0 && technical
    ? ["functional", "hiring_leader", "hiring_manager", "talent", "executive"]
    : freshRoles > 0 && commercial
      ? ["executive", "functional", "hiring_leader", "talent"]
      : ["executive", "functional", "talent", "hiring_leader"];

  // An untouched lane where somebody is actually known or sourced.
  for (const k of order) {
    if (state(k) === "Untouched" && has(k)) {
      const lane = LANES.find((l) => l.key === k);
      const attempted = LANES.filter((l) => state(l.key) === "Attempted");
      const why = attempted.length
        ? `${attempted.map((l) => l.label.toLowerCase()).join(" and ")} attempted with no reply. ${lane.label} has not been tried.`
        : `${lane.label} is the most likely door${freshRoles > 0 ? " for the roles they have open" : ""}.`;
      return { lane: k, label: lane.label, why };
    }
  }

  // Nobody known in any untouched lane: the gap is sourcing, not routing.
  for (const k of order) {
    if (state(k) === "Untouched") {
      const lane = LANES.find((l) => l.key === k);
      return {
        lane: k,
        label: lane.label,
        why: `Nobody is known or sourced at ${lane.label.toLowerCase()}. Source one before approaching.`,
      };
    }
  }
  return null;
}
