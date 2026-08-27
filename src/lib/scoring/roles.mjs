// How strong an opening one role is, out of 100.
//
// Freshness dominates on purpose. Every other factor describes the role, and
// this one describes the opportunity: a director level opening posted today is
// worth more as an approach than a better matched one posted six weeks ago
// that four agencies have already called about.
//
// Stored on the row as `relevance` so the desk can sort by it without
// re-deriving it in SQL, and recomputed on every pull because it decays.

const daysAgo = (d, asOf) =>
  d ? Math.floor((new Date(asOf ?? Date.now()).getTime() - new Date(d).getTime()) / 86_400_000) : null;

export function roleScore(r, asOf) {
  const age = daysAgo(r.first_seen, asOf);
  const fresh =
    age === null ? 20 : age <= 1 ? 45 : age <= 3 ? 38 : age <= 7 ? 30 : age <= 14 ? 22 : age <= 30 ? 14 : 6;

  const t = String(r.title ?? "").toLowerCase();
  let seniority = 10;
  if (/chief|vp|vice president|head of/.test(t)) seniority = 25;
  else if (/director|principal|staff/.test(t)) seniority = 22;
  else if (/senior|sr\.|lead/.test(t)) seniority = 18;
  else if (/manager/.test(t)) seniority = 15;

  // The disciplines ALAC actually places into. A role outside them is real
  // hiring but not their hiring.
  let fit = 6;
  if (/engineer|engineering|scientist|architect|technician/.test(t)) fit = 20;
  else if (/program|product|manufacturing|operations|quality/.test(t)) fit = 16;
  else if (/security|clearance|classified/.test(t)) fit = 18;

  // A published band means a candidate conversation can start without a
  // salary discovery call, which makes the role easier to work.
  const paid = r.salary || r.salary_text ? 10 : 0;

  return Math.min(100, fresh + seniority + fit + paid);
}
