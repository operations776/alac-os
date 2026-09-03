// Explanations for the numbers that are not scored by a term-producing
// scorer: the band rank, the signal, the match, the next move.
//
// Section 4 of the brief. Each of these returns the same shape the Why panel
// takes, so a reader learns one gesture and gets the same depth everywhere.

import { difficulty, aging } from "./roles.mjs";
import { nextMove } from "./next-move.mjs";

const ago = (d) => {
  if (!d) return null;
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
};

/**
 * Why a company sits in the band it sits in.
 *
 * work_reason is written by the ranker as prose. This turns it back into the
 * facts behind it, so the panel can show what was counted rather than only
 * the sentence the ranker chose.
 */
export function explainBand(a) {
  const facts = [
    { label: "Fit score, from the master list", value: a.final_score != null ? `${Math.round(Number(a.final_score))} / 100` : "not scored" },
    { label: "Urgency, from what changed", value: a.heat_score != null ? `${a.heat_score} / 100` : "nothing recorded" },
    { label: "Relevant roles open", value: String(a.qualified_roles ?? 0) },
    { label: "Posted in the last week", value: String(a.fresh_roles ?? 0) },
    { label: "People you know there", value: String(a.warm_contacts ?? 0) },
    { label: "Decision makers among them", value: String(a.decision_makers ?? 0) },
  ];
  if (a.pin_active) {
    facts.unshift({
      label: "Owner override",
      value: `${a.pinned_rank ? `manual rank ${a.pinned_rank}` : a.pinned_band}${a.pin_reason ? `, ${a.pin_reason}` : ""}${a.pin_expires ? `, until ${a.pin_expires}` : ""}`,
    });
  }
  return {
    score: a.work_score ?? null,
    summary: a.work_reason ?? "Ranked from fit, what changed, and who you know.",
    facts,
    freshness: a.banded_at ? `Ranked ${ago(a.banded_at)}` : null,
  };
}

/** Why one role is worth calling about, in full. */
export function explainRoleFull(r) {
  const d = difficulty(r.title, { occupation: r.occupation });
  const a = aging(r.first_seen);
  const facts = [
    { label: "How hard to fill", value: `${d.value} / 100` },
    { label: "How long open", value: a.age == null ? "unknown" : `${a.age} days` },
  ];
  if (r.location) facts.push({ label: "Location", value: r.location });
  if (r.salary_text) facts.push({ label: "Published salary", value: r.salary_text });
  if (r.occupation) facts.push({ label: "Occupation", value: r.occupation });
  if (r.open_at_company) facts.push({ label: "Open roles at this company", value: String(r.open_at_company) });

  const summary =
    d.value >= 70
      ? "Hard to fill, which is what an agency is paid for."
      : d.value >= 50
        ? "Moderately hard, worth a conversation."
        : "The client can probably fill this themselves.";

  return {
    summary: a.age != null && a.age >= 45
      ? `${summary} Open ${a.age} days, so their own pipeline has not solved it.`
      : summary,
    facts,
    freshness: r.first_seen ? `First seen ${ago(r.first_seen)}` : null,
  };
}

/** Why a signal matters, and how far to trust it. */
export function explainSignal(s) {
  const facts = [];
  if (s.category) facts.push({ label: "Kind of event", value: String(s.category).replace(/_/g, " ") });
  if (s.amount_usd) facts.push({ label: "Amount", value: `$${Number(s.amount_usd).toLocaleString()}` });
  if (s.person_name) facts.push({ label: "Person", value: `${s.person_name}${s.person_title ? `, ${s.person_title}` : ""}` });
  facts.push({ label: "Found by", value: s.source === "predictleads" ? "the system, automatically" : "hand, from the workbook" });
  if (s.tam_final_score) facts.push({ label: "The company's standing fit score", value: `${Math.round(Number(s.tam_final_score))} / 100` });

  return {
    summary: s.detail || s.what_happened || "Something changed at this company.",
    facts,
    confidence: s.confidence != null ? `${Math.round(Number(s.confidence) * 100)}%` : null,
    // The driver hands back a Date for a date column, so it is formatted here
    // rather than interpolated: a raw Date prints a full timestamp with a
    // timezone, which is not a thing to show anyone.
    freshness: s.signal_date ? `Dated ${String(new Date(s.signal_date).toISOString().slice(0, 10))}` : "Undated",
    source: s.primary_source && /^https?:\/\//i.test(s.primary_source)
      ? { label: "Read the source", href: s.primary_source }
      : null,
  };
}

/** Why the desk is recommending this move, and what would change it. */
export function explainMove(a) {
  const m = nextMove(a);
  const facts = [
    { label: "Where they are", value: a.prep_status ?? "not started" },
    { label: "Roles posted this week", value: String(a.fresh_roles ?? 0) },
    { label: "Latest change", value: a.signal_date ? `${a.signal_text ?? "recorded"}, ${ago(a.signal_date)}` : "nothing recorded" },
    { label: "Best contact", value: a.top_contact ? `${a.top_contact}${a.top_contact_title ? `, ${a.top_contact_title}` : ""}` : "nobody sourced" },
    { label: "Message sent", value: a.last_contacted_at ? `${a.last_contacted_name ?? "someone"}, ${ago(a.last_contacted_at)}` : "not yet" },
  ];
  return { summary: m.why, facts, move: m.move, kind: m.kind };
}
