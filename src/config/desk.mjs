// The numbers the desk runs on, stated once.
//
// Three different screens used to say 10, 20 and 25 for "this week's
// accounts" and each was right about something different. These are the
// definitions, and every screen reads them from here.

export const DESK = {
  // The owner's working portfolio. He decides membership; the ranking only
  // recommends. These are the sizes the recommendations are made against.
  NOW_SIZE: 25,
  NEXT_SIZE: 25,
  // Friday close: this many companies fully prepared and approved for the
  // coming week. A subset of Work now, never a separate list.
  WEEK_TARGET: 10,

  // Producer-facing noise limits, his clarification of 9 September. The
  // system processes everything; the screen surfaces this much.
  SIGNALS_ON_TODAY: 5,
  SIGNAL_MIN_HEAT: 50,
  SIGNAL_FRESH_DAYS: 30,
  LIVE_LEADS_PER_DAY: 5,
  // A new posting cannot have aged, so the daily leads gate on how hard the
  // role is to fill, out of 100, and time open breaks ties. 50 is "moderately
  // hard": senior, or cleared, or a scarce specialism.
  LEAD_MIN_DIFFICULTY: 50,
  // Roles shown by default: the top share of the whole corpus by commercial
  // score. Everything below it is processed, stored and one click away.
  ROLE_TOP_SHARE: 0.10,
  ROLE_FRESH_DAYS: 7,
  // A posting the provider has not seen for this long has come down.
  ROLE_STALE_DAYS: 7,

  // Heat at or above this makes a company a recommendation for the list.
  PROMOTE_HEAT: 60,
  // How often the feeds are pulled and the recommendations re-ranked.
  REFRESH: "Monday and Thursday mornings",
  // The cron, so the app can say when the next pull is rather than "soon".
  REFRESH_DAYS_UTC: [1, 4],
  REFRESH_HOUR_UTC: 6,
};

/**
 * When the next scheduled pull runs, as a Date. Read by every screen that
 * has to say why a number is not there yet: a company added on Tuesday has
 * no roles until Thursday 06:00 UTC, and the screen should say exactly that.
 */
export function nextPullAt(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 8; i += 1) {
    const day = d.getUTCDay();
    if (DESK.REFRESH_DAYS_UTC.includes(day)) {
      const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DESK.REFRESH_HOUR_UTC));
      if (at > from) return at;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return null;
}

/**
 * The portfolio rules, in words. Read on screen, enforced in the view and
 * the queries. If these two ever disagree the screen is lying.
 */
export const PORTFOLIO_RULES = [
  "Top 25 and Next 25 are yours. A company is on the list because you put it there, and it leaves when you take it off. The ranking never moves a company in or out on its own.",
  "The ranking recommends. Every refresh it says which companies it would add and why, and you accept or decline each one. A declined company is not recommended again unless something new happens.",
  "Every company on the list has a score and the data behind it. Where the data is missing, the page says what is missing, why, and when the next pull will fill it.",
];

/**
 * The cascade. What each state does to a company's place on the list, its
 * recommendations, and its data. One table, applied by the view and every
 * query that reads it.
 */
export const CASCADE = [
  { state: "Active", list: "Stays where you put it", moves: "Recommended, with a next move", data: "Pulled every refresh" },
  { state: "Hold", list: "Off the working list, place remembered", moves: "No next move, no messages suggested", data: "Still pulled, so nothing is missed" },
  { state: "Nurture", list: "Off the working list, place remembered", moves: "Only surfaces on a strong signal", data: "Still pulled" },
  { state: "Disqualified", list: "Off every list", moves: "None. History kept", data: "No longer pulled" },
  { state: "Archived", list: "Off every list, hidden by default", moves: "None. Searchable", data: "No longer pulled" },
];
