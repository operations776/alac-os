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
      count(*) filter (where pin_active)::int                       as pinned,
      count(*) filter (where fresh_roles > 0)::int                  as with_fresh_roles,
      count(*) filter (where last_contacted_at is not null)::int    as contacted,
      count(*) filter (where top_contact is null)::int              as no_contact,
      count(*) filter (where heyreach_stage <> 'NOT LOADED')::int   as heyreach_live,
      count(*) filter (where sourcewhale_stage <> 'NOT LOADED')::int as sourcewhale_live
    from account_desk
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
    band?: string;
    sw?: string;
    disposition?: string;
    pinned?: boolean;
    hasRoles?: boolean;
    hasSignal?: boolean;
    noContact?: boolean;
    contacted?: boolean;
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
  // Each of these backs a clickable number somewhere on the desk. Section 7:
  // every summary figure opens the exact records that produced it.
  const band = opts.band ?? "";
  const sw = opts.sw ?? "";
  // Archived and disqualified accounts are out of the default view but stay
  // fully searchable, section 9.1. An explicit filter is how you reach them.
  const disposition = opts.disposition ?? "";
  const pinned = opts.pinned ? 1 : 0;
  const hasRoles = opts.hasRoles ? 1 : 0;
  const hasSignal = opts.hasSignal ? 1 : 0;
  const noContact = opts.noContact ? 1 : 0;
  const contacted = opts.contacted ? 1 : 0;

  // Each filter is an "or the filter is absent" clause, so one statement
  // serves every combination and no SQL is ever concatenated. The predicate is
  // repeated in the count query below because the driver cannot compose
  // fragments; the two must be kept identical.
  const rows = (await sql`
    select a.*
      from account_desk a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(a.record_id) like ${pattern})
       and (${priority} = '' or a.priority::text = ${priority})
       and (${prep} = '' or a.prep_status::text = ${prep})
       and (${motion} = '' or a.recommended_motion::text = ${motion})
       and (${onlyNextWeek} = 0 or a.next_week)
       and (${band} = '' or a.effective_band = ${band})
       and (${pinned} = 0 or a.pin_active)
       and (${hasRoles} = 0 or a.fresh_roles > 0)
       and (${hasSignal} = 0 or a.signal_date is not null)
       and (${noContact} = 0 or a.top_contact is null)
       and (${contacted} = 0 or a.last_contacted_at is not null)
       and (${sw} = '' or a.sw_state = ${sw})
       and (case when ${disposition} = '' then a.disposition not in ('Archived', 'Disqualified')
                 else a.disposition = ${disposition} end)
     order by a.pin_active desc, a.pinned_rank asc nulls last,
              a.priority nulls last, a.final_score desc nulls last, a.company_name
     limit ${perPage} offset ${offset}
  `) as DeskRow[];

  const totalRows = (await sql`
    select count(*)::int as n
      from account_desk a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(a.record_id) like ${pattern})
       and (${priority} = '' or a.priority::text = ${priority})
       and (${prep} = '' or a.prep_status::text = ${prep})
       and (${motion} = '' or a.recommended_motion::text = ${motion})
       and (${onlyNextWeek} = 0 or a.next_week)
       and (${band} = '' or a.effective_band = ${band})
       and (${pinned} = 0 or a.pin_active)
       and (${hasRoles} = 0 or a.fresh_roles > 0)
       and (${hasSignal} = 0 or a.signal_date is not null)
       and (${noContact} = 0 or a.top_contact is null)
       and (${contacted} = 0 or a.last_contacted_at is not null)
       and (${sw} = '' or a.sw_state = ${sw})
       and (case when ${disposition} = '' then a.disposition not in ('Archived', 'Disqualified')
                 else a.disposition = ${disposition} end)
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
    select * from account_desk
     where org_id = ${orgId} and id = ${id}
     limit 1
  `) as DeskRow[];
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
  detail: string | null;
  sources: string[];
  source: string | null;
  category: string | null;
  amount_usd: string | null;
  person_name: string | null;
  person_title: string | null;
  confidence: string | null;
  work_band: string | null;
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
           s.heat_vs_tam, s.recommended_move, s.primary_source, s.detail, s.sources,
           s.source::text as source, s.category, s.amount_usd, s.person_name,
           s.person_title, s.confidence, a.work_band
      from heat_signals s
      left join tam_accounts a on a.id = s.account_id
     where s.org_id = ${orgId}
     order by s.signal_date desc nulls last, s.heat_score desc nulls last
     limit ${limit}
  `) as HeatRow[];
}

export async function signalsForAccount(orgId: string, accountId: string) {
  return (await sql`
    select s.id, s.company_name, s.account_id, null::text as account_record_id,
           s.signal_date, s.what_happened, s.the_number, s.hq, s.best_contact,
           s.hiring_urgency, s.icp_fit, s.capital, s.talent_scarcity,
           s.access, s.freshness, s.heat_score, s.tam_final_score,
           s.heat_vs_tam, s.recommended_move, s.primary_source, s.detail, s.sources
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

/* -------------------------------------------------------------------------
   Targets and roles

   The account package the desk acts on: who to contact, what they are hiring
   for, and the narrative that ties the two together.
   ---------------------------------------------------------------------- */

export type TargetRow = {
  id: string;
  full_name: string;
  title: string | null;
  linkedin_url: string | null;
  location: string | null;
  email: string | null;
  email_status: string | null;
  email_revealed: boolean;
  rank_score: number | null;
  rank_terms: string[];
  is_warm: boolean;
  source: string;
};

/**
 * Who to contact at this account, best first.
 *
 * Sourced targets and the warm network are one list, not two. A first degree
 * contact carries a rank bonus, so "someone you already know" naturally rises
 * above a cold name with the same title, which is the whole point: the shortest
 * path to a conversation is a person who will recognise the sender.
 */
export async function targetsForAccount(orgId: string, accountId: string) {
  // Sourced contacts AND the warm network, as one ranked list.
  //
  // This used to read account_targets alone, which meant 109 accounts showed
  // "no targets sourced" while the operator already knew people there. The
  // warm network is the better list, not a footnote to it: someone who will
  // recognise the sender outranks a stranger with a better title.
  //
  // A warm contact that has also been sourced appears once. account_targets
  // already carries is_warm for exactly that case, so the union filters the
  // people table down to whoever the vendor did not return.
  return (await sql`
    select t.id, t.full_name, t.title, t.linkedin_url, t.location, t.email,
           t.email_status, t.email_revealed, t.rank_score, t.rank_terms,
           t.is_warm, t.source::text as source
      from account_targets t
     where t.org_id = ${orgId} and t.account_id = ${accountId}

    union all

    select p.id, p.full_name, p.title, p.linkedin_url, null as location,
           null as email, null as email_status, false as email_revealed,
           -- Warm contacts are ranked by ROLE, not just by the decision maker
           -- flag. Nearly every senior contact carries that flag, so ranking
           -- on it alone left six people tied at 95 and the tiebreak was
           -- alphabetical: it put a Head of Marketing top at a company hiring
           -- twenty engineers. Marketing does not own the requisition.
           --
           -- The bands mirror the sourced ranking, so a known talent lead and
           -- a sourced one sort against each other sensibly.
           (case
              when p.title ~* 'talent|recruit|people ops|head of people' then 95
              when p.title ~* 'engineer|technical|cto|chief technology' then 88
              when p.title ~* 'chief|founder|ceo|coo|president' then 82
              when p.title ~* 'program|product|operations' then 74
              when p.is_decision_maker then 70
              else 55
            end) as rank_score,
           (case
              when p.title ~* 'talent|recruit|people ops|head of people'
                then '["Already a first degree connection","Owns hiring"]'::jsonb
              when p.title ~* 'engineer|technical|cto|chief technology'
                then '["Already a first degree connection","Runs the team hiring"]'::jsonb
              when p.title ~* 'chief|founder|ceo|coo|president'
                then '["Already a first degree connection","Executive"]'::jsonb
              else '["Already a first degree connection"]'::jsonb
            end) as rank_terms,
           true as is_warm,
           'network' as source
      from people p
     where p.org_id = ${orgId} and p.account_id = ${accountId}
       and not exists (
         select 1 from account_targets t2
          where t2.account_id = p.account_id
            and lower(trim(trailing '/' from t2.linkedin_url)) =
                lower(trim(trailing '/' from p.linkedin_url))
       )

     order by rank_score desc nulls last, full_name
     limit 25
  `) as TargetRow[];
}

export type RoleRow = {
  id: string;
  title: string;
  url: string | null;
  location: string | null;
  seniority: string | null;
  posted_at: string | null;
  qualified: boolean;
  first_seen: string | null;
  salary_text: string | null;
  relevance: number | null;
};

/**
 * The open requisitions behind the hiring signal.
 *
 * Qualified roles first: an unqualified posting is kept because the count of
 * what was excluded is informative, but it is never the reason to call.
 */
export async function rolesForAccount(orgId: string, accountId: string) {
  return (await sql`
    select r.id, r.title, r.url, r.location, r.seniority, r.posted_at, r.qualified,
           r.first_seen, r.salary_text, r.relevance
      from account_roles r
     where r.org_id = ${orgId} and r.account_id = ${accountId}
     order by r.qualified desc, r.relevance desc nulls last,
              coalesce(r.first_seen, r.posted_at) desc nulls last
     limit 40
  `) as RoleRow[];
}

/** Coverage counters for the account header. */
export async function accountPackage(orgId: string, accountId: string) {
  const rows = (await sql`
    select
      (select count(*)::int from account_roles
        where org_id = ${orgId} and account_id = ${accountId} and qualified) as qualified_roles,
      (select count(*)::int from account_roles
        where org_id = ${orgId} and account_id = ${accountId}) as total_roles,
      (select count(*)::int from account_targets
        where org_id = ${orgId} and account_id = ${accountId}) as targets,
      (select count(*)::int from account_targets
        where org_id = ${orgId} and account_id = ${accountId} and is_warm) as warm_targets,
      (select count(*)::int from account_targets
        where org_id = ${orgId} and account_id = ${accountId} and email_status = 'VERIFIED') as verified_emails
  `) as Record<string, number>[];
  return rows[0];
}

/** The generated brief, if the reasoning pass has run and was accepted. */
export async function briefForAccount(orgId: string, accountId: string) {
  const rows = (await sql`
    select why_now, contact_first, next_step, risks, reasoning_model, reasoning_at
      from heat_signals
     where org_id = ${orgId} and account_id = ${accountId} and why_now is not null
     order by reasoning_at desc nulls last
     limit 1
  `) as {
    why_now: string | null;
    contact_first: string | null;
    next_step: string | null;
    risks: string | null;
    reasoning_model: string | null;
    reasoning_at: string | null;
  }[];
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------
   The command board, in one round trip
   ---------------------------------------------------------------------- */

/**
 * Everything the board needs, as a single query.
 *
 * The board previously issued seven queries. Each one executes in about 1.5ms,
 * so the database was never the problem: the cost was seven round trips to a
 * database in another region, at roughly 250ms of network latency each. That
 * is the whole two second page load, and no index can fix it.
 *
 * One statement, several subqueries, each returning its slice as json. The
 * work is identical; what disappears is six network waits.
 */
export async function commandBoard(orgId: string, period: Period) {
  const days = PERIOD_DAYS[period];
  const rows = (await sql`
    select
      (select coalesce(json_agg(x), '[]'::json) from (
        select a.id, a.record_id, a.priority, a.final_score, a.company_name,
               a.linkedin_url, a.next_week, a.sales_nav_url, a.battlecard_url,
               a.recommended_motion, a.prep_status, a.next_action,
               a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded,
               a.sourcewhale_stage
          from tam_accounts a
         where a.org_id = ${orgId} and a.next_week
         order by a.priority nulls last, a.final_score desc nulls last
      ) x) as next_week,

      (select coalesce(json_agg(x), '[]'::json) from (
        select * from account_desk
         where org_id = ${orgId} and effective_band = 'now'
           and prep_status <> 'HOLD'
         order by pin_active desc, pinned_rank asc nulls last,
                  work_score desc nulls last, company_name
      ) x) as now,

      (select coalesce(json_agg(x), '[]'::json) from (
        select * from account_desk
         where org_id = ${orgId} and effective_band = 'next'
           and prep_status <> 'HOLD'
         order by pin_active desc, pinned_rank asc nulls last,
                  work_score desc nulls last, company_name
      ) x) as next,

      (select coalesce(json_agg(x), '[]'::json) from (
        select s.id, s.company_name, s.account_id, s.what_happened, s.heat_score,
               s.heat_vs_tam, s.recommended_move, s.coverage, s.signal_date,
               s.category, s.source::text as source, a.work_band
          from heat_signals s
          left join tam_accounts a on a.id = s.account_id
         where s.org_id = ${orgId}
         order by s.signal_date desc nulls last, s.heat_score desc nulls last
         limit 8
      ) x) as heat,

      (select coalesce(json_agg(x), '[]'::json) from (
        select r.id, r.account_id, a.company_name, a.work_band, r.title, r.url,
               r.location, r.salary_text, r.seniority, r.first_seen, r.relevance,
               0 as open_at_company, null::text as why_now
          from account_roles r
          join tam_accounts a on a.id = r.account_id
         where r.org_id = ${orgId} and r.qualified
           and r.first_seen >= current_date - 1
         order by r.relevance desc nulls last, r.first_seen desc
         limit 10
      ) x) as roles_today,

      (select row_to_json(x) from (
        select count(*) filter (where first_seen >= current_date - 1)::int as today,
               count(*) filter (where first_seen >= current_date - 7)::int as week,
               max(fetched_at) as pulled_at
          from account_roles where org_id = ${orgId} and qualified
      ) x) as role_counts,

      (select row_to_json(x) from (
        select count(*)::int as total,
               count(*) filter (where next_week)::int as next_week,
               count(*) filter (where prep_status = 'READY FOR QC')::int as ready_for_qc,
               count(*) filter (where priority = 'unscored')::int as unscored
          from tam_accounts where org_id = ${orgId}
      ) x) as counts,

      (select row_to_json(x) from (
        select count(*)::int as total,
               count(*) filter (where account_id is null)::int as unlinked,
               count(*) filter (where heat_vs_tam > 0)::int as hotter_than_tam,
               max(heat_score)::int as top_heat
          from heat_signals where org_id = ${orgId}
      ) x) as heat_stats,

      (select row_to_json(x) from (
        select sum(bd_calls)::int as bd_calls,
               sum(client_conversations)::int as client_conversations,
               sum(discoveries)::int as discoveries,
               sum(qualified_opps)::int as qualified_opps,
               sum(searches_won)::int as searches_won,
               sum(pipeline_usd)::bigint as pipeline_usd,
               count(*)::int as weeks
          from performance_weeks
         where org_id = ${orgId} and week_ending > (current_date - ${days}::int)
      ) x) as perf
  `) as {
    next_week: QueueRow[];
    now: DeskRow[];
    next: DeskRow[];
    heat: HeatRow[];
    roles_today: FreshRole[];
    role_counts: { today: number; week: number; pulled_at: string | null };
    counts: Record<string, number>;
    heat_stats: Record<string, number>;
    perf: Record<string, number | null>;
  }[];
  return rows[0];
}

/* -------------------------------------------------------------------------
   The market map
   ---------------------------------------------------------------------- */

/**
 * One account as the desk sees it: the queue row plus every input the next
 * move needs. Read from the account_desk view, so every screen that shows a
 * company shows the same numbers for it.
 */
export type DeskRow = QueueRow & {
  domain: string | null;
  hq: string | null;
  work_band: string | null;
  work_reason: string | null;
  work_score: number | null;
  banded_at: string | null;
  heat_score: number | null;
  signal_date: string | null;
  signal_category: string | null;
  signal_text: string | null;
  qualified_roles: number;
  fresh_roles: number;
  warm_contacts: number;
  decision_makers: number;
  targets: number;
  top_contact: string | null;
  top_contact_title: string | null;
  has_draft: boolean;
  last_contacted_at: string | null;
  contacted_count: number;
  last_contacted_name: string | null;
  notes_count: number;
  last_note: string | null;
  pinned_band: string | null;
  pinned_rank: number | null;
  pin_reason: string | null;
  pin_expires: string | null;
  pin_active: boolean;
  effective_band: string | null;
  disposition: string;
  disposition_reason: string | null;
  sw_state: string;
  sw_campaign: string | null;
  sw_contacts: number | null;
  sw_last_activity: string | null;
  lanes_touched: number;
  lanes_engaged: number;
};

/** The six organizational levels for one account, section 14. */
export async function touchesForAccount(orgId: string, accountId: string) {
  return (await sql`
    select lane, status, person, channel, outcome, touched_at::text as touched_at
      from org_touches
     where org_id = ${orgId} and account_id = ${accountId}
  `) as {
    lane: string; status: string; person: string | null;
    channel: string | null; outcome: string | null; touched_at: string | null;
  }[];
}

/**
 * SourceWhale coverage by band, section 15.2.
 *
 * Counted from the account rows rather than stored, so the bar and the list
 * behind each segment can never disagree.
 */
export async function coverage(orgId: string) {
  const rows = (await sql`
    select effective_band as band, sw_state, count(*)::int as n
      from account_desk
     where org_id = ${orgId} and effective_band in ('now', 'next')
       and disposition = 'Active'
     group by 1, 2
  `) as { band: string; sw_state: string; n: number }[];

  const out: Record<string, Record<string, number>> = { now: {}, next: {} };
  for (const r of rows) out[r.band][r.sw_state] = r.n;
  return out;
}

/** The operator's own notes on a company, newest first. */
export async function notesForAccount(orgId: string, accountId: string) {
  return (await sql`
    select id, body, created_at from account_notes
     where org_id = ${orgId} and account_id = ${accountId}
     order by created_at desc
     limit 100
  `) as { id: string; body: string; created_at: string }[];
}

export type MoveRow = {
  id: string;
  account_id: string;
  company_name: string;
  from_band: string | null;
  to_band: string;
  reason: string | null;
  moved_at: string;
};

/** Who changed band, newest first. Entries into an unranked market are noise and are skipped. */
export async function recentMoves(orgId: string, limit = 40) {
  return (await sql`
    select m.id, m.account_id, a.company_name, m.from_band, m.to_band, m.reason, m.moved_at
      from band_moves m
      join tam_accounts a on a.id = m.account_id
     where m.org_id = ${orgId} and m.from_band is not null
     order by m.moved_at desc, a.company_name
     limit ${limit}
  `) as MoveRow[];
}

/** One company's band history, newest first. */
export async function movesForAccount(orgId: string, accountId: string) {
  return (await sql`
    select m.id, m.account_id, null::text as company_name, m.from_band, m.to_band, m.reason, m.moved_at
      from band_moves m
     where m.org_id = ${orgId} and m.account_id = ${accountId}
     order by m.moved_at desc
     limit 10
  `) as MoveRow[];
}

/** Marks by hand: checklist items done, roles already mentioned. */
export async function marksForAccount(orgId: string, accountId: string) {
  const rows = (await sql`
    select kind, ref, done from desk_marks
     where org_id = ${orgId} and account_id = ${accountId} and done
  `) as { kind: string; ref: string; done: boolean }[];
  return new Set(rows.map((r) => `${r.kind}:${r.ref}`));
}

export type BandRow = DeskRow;

/**
 * Work now, Up next and the Backlog. The reason travels with the row: a screen
 * that made the operator click through to find out why a company is on the
 * list would just be the spreadsheet again.
 */
export async function marketMap(orgId: string, band: string, limit = 25, offset = 0) {
  // The effective band, so a pinned company appears where the owner put it
  // rather than where the ranking put it. Pins sort first, by their manual
  // rank when one was given.
  return (await sql`
    select * from account_desk
     where org_id = ${orgId} and effective_band = ${band}
     order by pin_active desc, pinned_rank asc nulls last,
              work_score desc nulls last, company_name
     limit ${limit} offset ${offset}
  `) as DeskRow[];
}

/** How many sit in each band, and how much of the map is actually prepared. */
export async function marketCounts(orgId: string) {
  const rows = (await sql`
    select
      count(*) filter (where effective_band = 'now')::int      as now,
      count(*) filter (where effective_band = 'next')::int     as next,
      count(*) filter (where effective_band = 'backlog')::int  as backlog,
      count(*) filter (where effective_band is not null)::int  as mapped,
      count(*) filter (where pin_active)::int                  as pinned,
      count(*) filter (where domain is not null)::int     as with_domain,
      count(*) filter (where exists (select 1 from account_targets t where t.account_id = account_desk.id))::int as with_targets,
      max(banded_at)                                      as last_mapped
      from account_desk where org_id = ${orgId}
  `) as { now: number; next: number; backlog: number; mapped: number; pinned: number; with_domain: number; with_targets: number; last_mapped: string | null }[];
  return rows[0];
}

/**
 * This week's hand kept counters.
 *
 * Returns every metric, including the ones never touched, so the screen shows
 * a full row of zeros to click rather than appearing empty until first use.
 */
export async function manualMetrics(orgId: string) {
  const rows = (await sql`
    select metric, value
      from manual_metrics
     where org_id = ${orgId}
       and week_starting = date_trunc('week', current_date)::date
  `) as { metric: string; value: number }[];

  const out: Record<string, number> = {
    bd_calls: 0,
    client_conversations: 0,
    discoveries: 0,
    qualified_opps: 0,
    commercial_asks: 0,
    searches_won: 0,
    placements: 0,
  };
  for (const r of rows) out[r.metric] = r.value;
  return out;
}

/** The drafted opening messages for an account. */
export async function draftsForAccount(orgId: string, accountId: string) {
  return (await sql`
    select id, person_name, channel, body, opening_line, why_this_angle,
           facts_used, sources, model, drafted_at, approved, sent_at, custom
      from outreach_drafts
     where org_id = ${orgId} and account_id = ${accountId}
     order by sent_at desc nulls last, drafted_at desc
     limit 25
  `) as {
    id: string;
    person_name: string;
    channel: string;
    body: string;
    opening_line: string | null;
    why_this_angle: string | null;
    facts_used: string[];
    sources: string[];
    model: string | null;
    drafted_at: string;
    approved: boolean;
    sent_at: string | null;
    custom: boolean;
  }[];
}

export type FreshRole = {
  id: string;
  account_id: string;
  company_name: string;
  work_band: string | null;
  title: string;
  url: string | null;
  location: string | null;
  salary_text: string | null;
  seniority: string | null;
  first_seen: string | null;
  relevance: number | null;
  open_at_company: number;
  why_now: string | null;
};

/**
 * Roles that went up recently, newest first.
 *
 * The desk question is "what can I call about today". A role posted this
 * morning is a reason to contact somebody this morning; the same role in three
 * weeks is one of forty and no longer a reason for anything, so this screen is
 * ordered by when it appeared rather than by how well it scores.
 *
 * `why_now` is the account's strongest signal, carried onto the row, because a
 * new role plus the round that paid for it is a call and a new role alone is a
 * job board.
 */
export async function freshRoles(orgId: string, days = 7, limit = 60, sort: "new" | "relevant" = "new") {
  const byRelevance = sort === "relevant";
  return (await sql`
    select r.id, r.account_id, a.company_name, a.work_band,
           r.title, r.url, r.location, r.salary_text, r.seniority,
           r.first_seen, r.relevance,
           (select count(*)::int from account_roles x
             where x.account_id = a.id and x.qualified) as open_at_company,
           (select h.what_happened from heat_signals h
             where h.account_id = a.id
             order by h.signal_date desc nulls last limit 1) as why_now
      from account_roles r
      join tam_accounts a on a.id = r.account_id
     where r.org_id = ${orgId}
       and r.qualified
       and r.first_seen >= current_date - ${days}::int
     order by case when ${byRelevance} then r.relevance end desc nulls last,
              r.first_seen desc nulls last, a.company_name, r.title
     limit ${limit}
  `) as FreshRole[];
}

/** Counts for the fresh roles header. */
export async function freshRoleCounts(orgId: string) {
  const rows = (await sql`
    select
      count(*) filter (where first_seen >= current_date)::int        as today,
      count(*) filter (where first_seen >= current_date - 1)::int    as day,
      count(*) filter (where first_seen >= current_date - 7)::int    as week,
      count(distinct account_id) filter (where first_seen >= current_date - 7)::int as companies,
      count(*)::int                                                  as total,
      max(fetched_at)                                                as pulled_at
    from account_roles
    where org_id = ${orgId} and qualified
  `) as { today: number; day: number; week: number; companies: number; total: number; pulled_at: string | null }[];
  return rows[0];
}
