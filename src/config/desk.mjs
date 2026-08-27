// The numbers the desk runs on, stated once.
//
// Three different screens used to say 10, 20 and 25 for "this week's
// accounts" and each was right about something different. These are the
// definitions, and every screen reads them from here.

export const DESK = {
  // Companies in Work now: the ones being contacted, in rank order.
  NOW_SIZE: 25,
  // The bench behind them. Promoted into Work now as slots free up.
  NEXT_SIZE: 25,
  // Friday close: this many companies fully prepared and approved for the
  // coming week. A subset of Work now, never a separate list.
  WEEK_TARGET: 10,
  // A signal older than this no longer argues for timing on its own.
  SIGNAL_FRESH_DAYS: 30,
  // A role older than this is one of many, not a reason to call today.
  ROLE_FRESH_DAYS: 7,
  // Heat at or above this promotes a company into the working list.
  PROMOTE_HEAT: 60,
  // How often the feeds are pulled and the bands re-ranked. Twice a week is a
  // cost decision: signals are free to re-read, roles are not.
  REFRESH: "Monday and Thursday mornings",
};

/**
 * How a company moves between the bands. Read on the Who to target screen,
 * enforced in assignBands. If these two ever disagree the screen is lying.
 */
export const ROLLOVER_RULES = [
  "Every refresh re-ranks the whole market. Nobody is stuck in a band: the rank is recomputed from fit, what changed, and who you know.",
  `A company leaves Work now when it is marked On hold, or when its rank falls below ${DESK.NOW_SIZE} because others moved ahead of it. The top of Up next takes the slot.`,
  `A strong signal (heat ${DESK.PROMOTE_HEAT} or more, inside ${DESK.SIGNAL_FRESH_DAYS} days) guarantees at least Up next, whatever the fit score says. That is how a signal on What changed enters the working list.`,
  "Approved companies stay in Work now until outreach is loaded. They are the ones being worked, not the ones still being decided.",
  "A company you are working (a note, a tick, a message sent in the last three weeks, research started) never drops a band. The ranking decides who to start on, not who to stop on.",
  "Every move is recorded. Notes, ticks and messages stay with the company whatever band it is in, so a company that comes back looks exactly as you left it.",
];
