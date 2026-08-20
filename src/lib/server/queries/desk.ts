import "server-only";
import { sql } from "@/lib/server/db";
import { currentSession } from "@/lib/server/auth";

/**
 * The org for the signed in operator. It comes from the verified session and
 * never from a URL or a request body, which is the whole of the tenant scoping
 * rule: every query below takes orgId as its first argument, and this is the
 * only place that argument can come from.
 */
export async function getOrgId(): Promise<string | null> {
  const session = await currentSession();
  return session?.orgId ?? null;
}

/**
 * The desk queries.
 *
 * Every function takes orgId first and it comes from the verified session,
 * never from a URL or a request body. CLAUDE.md, tenant scoping.
 *
 * The ranking rule appears in several of these and is quoted from the
 * operating instructions: Priority 1, then 2, then 3, and inside a priority
 * the highest Final Score first. UNSCORED strategic accounts are excluded
 * from Top 25 and Next 25 ranking, which is why the order clause filters on
 * priority rather than sorting the enum and hoping.
 */

export type Priority = "priority_1" | "priority_2" | "priority_3" | "unscored";
export type PrepStatus = "NOT STARTED" | "IN RESEARCH" | "READY FOR QC" | "APPROVED" | "HOLD";
export type Motion = "TBD" | "LIVE LEAD" | "GENERAL BD" | "MPC WEDGE" | "NURTURE" | "HOLD";

export type QueueRow = {
  id: string;
  record_id: string;
  priority: Priority | null;
  final_score: string | null;
  company_name: string;
  linkedin_url: string | null;
  next_week: boolean;
  sales_nav_url: string | null;
  battlecard_url: string | null;
  recommended_motion: Motion;
  prep_status: PrepStatus;
  next_action: string | null;
  heyreach_stage: string;
  heyreach_date: string | null;
  heyreach_uploaded: boolean;
  sourcewhale_stage: string;
};

// The column list is spelled out in each query rather than shared through a
// helper. `sql` is Neon's HTTP tagged template: it parameterizes interpolated
// values and has no fragment composition, so a shared string would have to be
// injected raw. Repeating the list is the cost of never building SQL by
// concatenation, and it is the pattern the rest of this directory follows.

/** Human labels for the priority enum, in one place. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  priority_1: "Priority 1",
  priority_2: "Priority 2",
  priority_3: "Priority 3",
  unscored: "UNSCORED",
};

/* -------------------------------------------------------------------------
   COMMAND BOARD
   ---------------------------------------------------------------------- */

/**
 * NEXT WEEK. Every company flagged for the coming week.
 *
 * The instructions set the target at exactly 10 by Friday close, so the board
 * has to show the real count rather than capping the list: a screen that
 * silently shows 10 of 20 would hide the thing the rule exists to catch.
 */
export async function nextWeek(orgId: string) {
  return (await sql`
    select a.id, a.record_id, a.priority, a.final_score, a.company_name,
           a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
           a.recommended_motion, a.prep_status, a.next_action,
           a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
           a.sourcewhale_stage
      from tam_accounts a
     where a.org_id = ${orgId} and a.next_week
     order by a.priority nulls last, a.final_score desc nulls last
  `) as QueueRow[];
}

/**
 * TOP 25 and NEXT 25, in one pass.
 *
 * These are derived, never stored. The workbook recalculates them from the
 * queue on every change and so does this: storing a tier would let the stored
 * value drift away from the ranking that defines it.
 *
 * `offset` picks the band: 0 for Top 25, 25 for Next 25.
 */
export async function rankedBand(orgId: string, offset: number, limit = 25) {
  return (await sql`
    select a.id, a.record_id, a.priority, a.final_score, a.company_name,
           a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
           a.recommended_motion, a.prep_status, a.next_action,
           a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
           a.sourcewhale_stage
      from tam_accounts a
     where a.org_id = ${orgId}
       and a.priority is not null
       and a.priority <> 'unscored'
     order by a.priority, a.final_score desc nulls last, a.company_name
     limit ${limit} offset ${offset}
  `) as QueueRow[];
}

/** Counts for the board header and the queue filters. */
export async function deskCounts(orgId: string) {
  const rows = (await sql`
    select
      count(*)::int                                                as total,
      count(*) filter (where next_week)::int                       as next_week,
      count(*) filter (where prep_status = 'READY FOR QC')::int     as ready_for_qc,
      count(*) filter (where prep_status = 'APPROVED')::int         as approved,
      count(*) filter (where prep_status = 'IN RESEARCH')::int      as in_research,
      count(*) filter (where battlecard_url is not null)::int       as battlecards,
      count(*) filter (where sales_nav_url is not null)::int        as target_lead_lists,
      count(*) filter (where recommended_motion <> 'TBD')::int      as motion_set,
      count(*) filter (where priority = 'priority_1')::int          as priority_1,
      count(*) filter (where priority = 'priority_2')::int          as priority_2,
      count(*) filter (where priority = 'priority_3')::int          as priority_3,
      count(*) filter (where priority = 'unscored')::int            as unscored,
      count(*) filter (where heyreach_stage <> 'NOT LOADED')::int   as heyreach_live,
      count(*) filter (where sourcewhale_stage <> 'NOT LOADED')::int as sourcewhale_live
    from tam_accounts
    where org_id = ${orgId}
  `) as Record<string, number>[];
  return rows[0];
}

/* -------------------------------------------------------------------------
   ACCOUNT QUEUE
   ---------------------------------------------------------------------- */

export async function searchQueue(
  orgId: string,
  opts: {
    q?: string;
    priority?: string;
    prep?: string;
    motion?: string;
    nextWeek?: boolean;
    page?: number;
    perPage?: number;
  },
) {
  const perPage = opts.perPage ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * perPage;
  const q = (opts.q ?? "").trim();
  const pattern = `%${q.toLowerCase()}%`;
  const priority = opts.priority ?? "";
  const prep = opts.prep ?? "";
  const motion = opts.motion ?? "";
  const onlyNextWeek = opts.nextWeek ? 1 : 0;

  // Each filter is an "or the filter is absent" clause, so one statement
  // serves every combination and no SQL is ever concatenated. The predicate is
  // repeated in the count query below because the driver cannot compose
  // fragments; the two must be kept identical.
  const rows = (await sql`
    select a.id, a.record_id, a.priority, a.final_score, a.company_name,
           a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
           a.recommended_motion, a.prep_status, a.next_action,
           a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
           a.sourcewhale_stage
      from tam_accounts a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(a.record_id) like ${pattern})
       and (${priority} = '' or a.priority::text = ${priority})
       and (${prep} = '' or a.prep_status::text = ${prep})
       and (${motion} = '' or a.recommended_motion::text = ${motion})
       and (${onlyNextWeek} = 0 or a.next_week)
     order by a.priority nulls last, a.final_score desc nulls last, a.company_name
     limit ${perPage} offset ${offset}
  `) as QueueRow[];

  const totalRows = (await sql`
    select count(*)::int as n
      from tam_accounts a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(a.record_id) like ${pattern})
       and (${priority} = '' or a.priority::text = ${priority})
       and (${prep} = '' or a.prep_status::text = ${prep})
       and (${motion} = '' or a.recommended_motion::text = ${motion})
       and (${onlyNextWeek} = 0 or a.next_week)
  `) as { n: number }[];

  return { rows, total: totalRows[0].n, perPage, page };
}

/** The QC queue: preparation finished, waiting on Adrian's decision. */
export async function readyForQc(orgId: string) {
  return (await sql`
    select a.id, a.record_id, a.priority, a.final_score, a.company_name,
           a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
           a.recommended_motion, a.prep_status, a.next_action,
           a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
           a.sourcewhale_stage
      from tam_accounts a
     where a.org_id = ${orgId} and a.prep_status = 'READY FOR QC'
     order by a.priority nulls last, a.final_score desc nulls last
  `) as QueueRow[];
}

export async function accountById(orgId: string, id: string) {
  const rows = (await sql`
    select a.id, a.record_id, a.priority, a.final_score, a.company_name,
           a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
           a.recommended_motion, a.prep_status, a.next_action,
           a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
           a.sourcewhale_stage
      from tam_accounts a
     where a.org_id = ${orgId} and a.id = ${id}
     limit 1
  `) as QueueRow[];
  return rows[0] ?? null;
}

/** Warm contacts matched to an account. The network survives the TAM swap. */
export async function peopleForAccount(orgId: string, accountId: string) {
  return (await sql`
    select p.id, p.full_name, p.title, p.linkedin_url, p.seniority,
           p.is_decision_maker, p.connected_on
      from people p
     where p.org_id = ${orgId} and p.account_id = ${accountId}
     order by p.is_decision_maker desc, p.full_name
  `) as {
    id: string;
    full_name: string;
    title: string | null;
    linkedin_url: string | null;
    seniority: string | null;
    is_decision_maker: boolean;
    connected_on: string | null;
  }[];
}

/* -------------------------------------------------------------------------
   SIGNAL HEAT
   ---------------------------------------------------------------------- */

export type HeatRow = {
  id: string;
  company_name: string;
  account_id: string | null;
  account_record_id: string | null;
  signal_date: string | null;
  what_happened: string;
  the_number: string | null;
  hq: string | null;
  best_contact: string | null;
  hiring_urgency: number | null;
  icp_fit: number | null;
  capital: number | null;
  talent_scarcity: number | null;
  access: number | null;
  freshness: number | null;
  heat_score: number | null;
  tam_final_score: string | null;
  heat_vs_tam: number | null;
  recommended_move: string | null;
  primary_source: string | null;
};

/**
 * The heat board, ranked. Signals with no TAM account are included on purpose:
 * roughly a third of the log is a company that produced a signal before it was
 * scored into the TAM, and those are the most interesting rows on the board.
 */
export async function signalHeat(orgId: string, limit = 100) {
  return (await sql`
    select s.id, s.company_name, s.account_id, a.record_id as account_record_id,
           s.signal_date, s.what_happened, s.the_number, s.hq, s.best_contact,
           s.hiring_urgency, s.icp_fit, s.capital, s.talent_scarcity,
           s.access, s.freshness, s.heat_score, s.tam_final_score,
           s.heat_vs_tam, s.recommended_move, s.primary_source
      from heat_signals s
      left join tam_accounts a on a.id = s.account_id
     where s.org_id = ${orgId}
     order by s.heat_score desc nulls last, s.signal_date desc nulls last
     limit ${limit}
  `) as HeatRow[];
}

export async function signalsForAccount(orgId: string, accountId: string) {
  return (await sql`
    select s.id, s.company_name, s.account_id, null::text as account_record_id,
           s.signal_date, s.what_happened, s.the_number, s.hq, s.best_contact,
           s.hiring_urgency, s.icp_fit, s.capital, s.talent_scarcity,
           s.access, s.freshness, s.heat_score, s.tam_final_score,
           s.heat_vs_tam, s.recommended_move, s.primary_source
      from heat_signals s
     where s.org_id = ${orgId} and s.account_id = ${accountId}
     order by s.signal_date desc nulls last
  `) as HeatRow[];
}

export async function heatCounts(orgId: string) {
  const rows = (await sql`
    select count(*)::int                                       as total,
           count(*) filter (where account_id is null)::int      as unlinked,
           count(*) filter (where heat_vs_tam > 0)::int         as hotter_than_tam,
           max(heat_score)::int                                 as top_heat,
           max(last_scored)                                     as last_scored
      from heat_signals
     where org_id = ${orgId}
  `) as { total: number; unlinked: number; hotter_than_tam: number; top_heat: number | null; last_scored: string | null }[];
  return rows[0];
}

/* -------------------------------------------------------------------------
   PERFORMANCE
   ---------------------------------------------------------------------- */

export type PerformanceWeek = {
  id: string;
  week_ending: string;
  bd_calls: number | null;
  client_conversations: number | null;
  discoveries: number | null;
  qualified_opps: number | null;
  commercial_asks: number | null;
  searches_won: number | null;
  pipeline_usd: string | null;
  placements: number | null;
  choke_point: string | null;
  evidence: string | null;
  hypothesis: string | null;
  countermeasure: string | null;
  marketing_brief: string | null;
  priority_1: string | null;
  priority_2: string | null;
  priority_3: string | null;
  research_tasking: string | null;
  top_10_ready: boolean | null;
};

export type Period = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

const PERIOD_DAYS: Record<Period, number> = {
  WEEK: 7,
  MONTH: 31,
  QUARTER: 93,
  YEAR: 366,
};

/**
 * Rollup over the weekly grain. The workbook has a period selector on
 * PERFORMANCE!B2 and the COMMAND BOARD snapshot follows it, so the same
 * selector drives this.
 *
 * The counters sum rather than coalescing to zero first: a period with no
 * reported weeks returns null, which the screen renders as "not reported".
 * The instructions are explicit that a missing number stays missing, so a
 * zero here would be an invented figure.
 */
export async function performanceRollup(orgId: string, period: Period) {
  const days = PERIOD_DAYS[period];
  const rows = (await sql`
    select sum(bd_calls)::int              as bd_calls,
           sum(client_conversations)::int  as client_conversations,
           sum(discoveries)::int           as discoveries,
           sum(qualified_opps)::int        as qualified_opps,
           sum(commercial_asks)::int       as commercial_asks,
           sum(searches_won)::int          as searches_won,
           sum(pipeline_usd)::bigint       as pipeline_usd,
           sum(placements)::int            as placements,
           count(*)::int                   as weeks
      from performance_weeks
     where org_id = ${orgId}
       and week_ending > (current_date - ${days}::int)
  `) as Record<string, number | null>[];
  return rows[0];
}

export async function performanceWeeks(orgId: string, limit = 12) {
  return (await sql`
    select id, week_ending, bd_calls, client_conversations, discoveries,
           qualified_opps, commercial_asks, searches_won, pipeline_usd,
           placements, choke_point, evidence, hypothesis, countermeasure,
           marketing_brief, priority_1, priority_2, priority_3,
           research_tasking, top_10_ready
      from performance_weeks
     where org_id = ${orgId}
     order by week_ending desc
     limit ${limit}
  `) as PerformanceWeek[];
}
