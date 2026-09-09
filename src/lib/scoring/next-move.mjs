// What to do next with a company, and where it is in its life.
//
// Every screen already showed fit, roles, signals and contacts and then left
// the reader to add them up. This is the adding up, done once, as a pure
// function, so the same company gets the same instruction on every screen.
//
// The output is one imperative sentence and a reason. It is deliberately not
// clever: the rules are readable top to bottom and the first that matches
// wins, because a recommendation the operator cannot predict is one they
// stop trusting.

/**
 * The stages a company passes through, in order. Derived, never stored:
 * prep_status says how far the research got, and the two outreach stages say
 * whether anything has actually been sent. Storing a seventh field for the
 * combination would let it drift from the six it summarises.
 */
// The stages are his own Kanban's columns, in his words, because the desk
// already thinks in them: Target, Researching, Pending review, Approved,
// then SourceWhale takes over, then Archive. The disposition and the
// SourceWhale state outrank the research status, because a company on hold
// or already in a campaign is not "being researched" whatever the workbook
// column says.
export const LIFECYCLE = [
  "Target",
  "Researching",
  "Pending review",
  "Approved",
  "In SourceWhale",
  "Campaign active",
  "Replied",
  "On hold",
  "Archived",
];

export function lifecycle({ prep_status, heyreach_stage, sourcewhale_stage, sw_state, disposition }) {
  if (disposition === "Archived" || disposition === "Disqualified") return "Archived";
  if (disposition === "Hold" || disposition === "Nurture" || prep_status === "HOLD") return "On hold";
  if (sw_state === "Replied" || sw_state === "Positive Reply") return "Replied";
  if (sw_state === "Active Campaign") return "Campaign active";
  if (sw_state === "Added" || sw_state === "Paused") return "In SourceWhale";
  if (sourcewhale_stage && sourcewhale_stage !== "NOT LOADED") return "Campaign active";
  if (heyreach_stage && heyreach_stage !== "NOT LOADED") return "In SourceWhale";
  switch (prep_status) {
    case "APPROVED": return "Approved";
    case "READY FOR QC": return "Pending review";
    case "IN RESEARCH": return "Researching";
    default: return "Target";
  }
}

const days = (d, asOf) =>
  d ? Math.floor((new Date(asOf ?? Date.now()).getTime() - new Date(d).getTime()) / 86_400_000) : null;

const CATEGORY_WHY = {
  receives_financing: "They raised money",
  increases_headcount_by: "Headcount grew",
  hires: "They hired someone senior",
  leaves: "Someone senior left, so there is a seat to fill",
  expands_offices_to: "They opened an office",
  expands_offices_in: "They expanded an office",
  expands_facilities: "They expanded facilities",
  acquires: "They acquired a company",
  signs_new_client: "They won a client",
  launches: "They launched something",
  has_valuation: "They were valued",
};

const ago = (n) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

/**
 * The next move.
 *
 * Input fields: prep_status, recommended_motion, heyreach_stage,
 * sourcewhale_stage, fresh_roles, signal_date, signal_category,
 * decision_makers, warm_contacts, targets, top_contact, has_draft, domain.
 *
 * Returns { kind, move, why }. kind is 'call', 'prepare' or 'wait'.
 */
export function nextMove(a, asOf) {
  const stage = lifecycle(a);
  const first = a.top_contact ?? null;
  const signalAge = days(a.signal_date, asOf);
  const hot = signalAge != null && signalAge >= 0 && signalAge <= 30;
  const fresh = Number(a.fresh_roles ?? 0);
  const reach =
    Number(a.decision_makers ?? 0) > 0 ||
    Number(a.warm_contacts ?? 0) > 0 ||
    Number(a.targets ?? 0) > 0;

  if (stage === "Archived") {
    return { kind: "wait", move: "Nothing", why: "Out of the working list. The history is kept." };
  }
  if (stage === "On hold") {
    return {
      kind: "wait",
      move: "Leave it",
      why: "On hold. Still watched, no outreach suggested, until you take it off hold.",
    };
  }
  if (stage === "Replied") {
    return {
      kind: "call",
      move: `Answer ${a.last_contacted_name ?? "the reply"}`,
      why: "They replied in SourceWhale. Nothing on this desk is more urgent than a live reply.",
    };
  }
  if (stage === "Campaign active") {
    return {
      kind: "wait",
      move: "Let the campaign run",
      why: "Active in SourceWhale. Watch for the reply there rather than starting a second thread.",
    };
  }
  if (stage === "In SourceWhale") {
    return fresh > 0
      ? {
          kind: "call",
          move: "Activate the campaign, there is a live role",
          why: `${fresh} relevant ${fresh === 1 ? "role" : "roles"} went up this week. Loaded but not active is a list, not outreach.`,
        }
      : {
          kind: "prepare",
          move: "Activate the campaign",
          why: "Loaded into SourceWhale and not yet active. Loaded is not the same as being worked.",
        };
  }
  const contactedAgo = days(a.last_contacted_at, asOf);
  if (contactedAgo != null && contactedAgo >= 0 && contactedAgo < 7) {
    return {
      kind: "wait",
      move: `Wait for ${a.last_contacted_name ?? "the reply"}`,
      why: `You messaged ${a.last_contacted_name ?? "them"} ${ago(contactedAgo)}. Follow up in ${7 - contactedAgo} ${7 - contactedAgo === 1 ? "day" : "days"} if nothing comes back.`,
    };
  }
  if (contactedAgo != null && contactedAgo >= 7 && contactedAgo <= 21) {
    return {
      kind: "call",
      move: `Follow up with ${a.last_contacted_name ?? first ?? "them"}`,
      why: `Messaged ${ago(contactedAgo)} with no reply recorded. One follow up, then park it.`,
    };
  }
  if (!a.domain) {
    return {
      kind: "prepare",
      move: "Find their website",
      why: "Without a domain nothing can be pulled: no roles, no signals, no contacts.",
    };
  }
  if (!reach) {
    return {
      kind: "prepare",
      move: "Source a contact",
      why: "Nobody known here and nobody sourced. Every other step needs a name.",
    };
  }
  if (stage === "Approved") {
    return {
      kind: "call",
      move: first ? `Load ${first} to LinkedIn` : "Load to LinkedIn",
      why: "Approved and nothing sent yet. The first step of the sequence is LinkedIn.",
    };
  }
  if (stage === "Needs review") {
    return {
      kind: "prepare",
      move: "Review and approve",
      why: "The research is done and waiting on your decision.",
    };
  }
  if (fresh > 0 && first) {
    return {
      kind: "call",
      move: `Call ${first} about the ${fresh === 1 ? "new role" : `${fresh} new roles`}`,
      why: `${fresh === 1 ? "A relevant role" : `${fresh} relevant roles`} went up in the last week${
        hot ? " and something changed at the company inside the month" : ""
      }. Nobody else has called yet.`,
    };
  }
  if (hot && first) {
    return {
      kind: "call",
      move: `Message ${first} about what changed`,
      why: `${CATEGORY_WHY[a.signal_category] ?? "Something changed"} ${ago(signalAge)}. Lead with that, not with the agency.`,
    };
  }
  if (!a.has_draft) {
    return {
      kind: "prepare",
      move: "Draft the first message",
      why: "A contact and a reason exist; the message does not.",
    };
  }
  if (a.recommended_motion === "TBD") {
    return {
      kind: "prepare",
      move: "Decide the approach",
      why: "The draft is written. An account cannot be reviewed with the approach undecided.",
    };
  }
  return {
    kind: "prepare",
    move: "Write the brief and mark it for review",
    why: "Contact, message and approach exist. Hand it over.",
  };
}
