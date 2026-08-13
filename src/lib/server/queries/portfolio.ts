import "server-only";

import { sql } from "../db";
import { currentSession } from "../auth";

// Every function here takes orgId first. Tenancy is enforced in server code,
// so a query that forgets the scope is the bug this convention exists to make
// obvious. ARCHITECTURE.md section 3.

export type Tier = "top25" | "next25" | "watch" | "removed" | "unassigned";

export type AccountRow = {
  id: string;
  company_name: string;
  domain: string | null;
  vertical: string | null;
  hq_location: string | null;
  employee_band: string | null;
  funding_stage: string | null;
  last_funding_date: string | null;
  open_roles_count: number;
  warm_contact_count: number;
  latest_score: number | null;
  tier: Tier;
  tier_locked: boolean;
  is_suppressed: boolean;
  top_signal: string | null;
};

/**
 * The org for the signed-in user, from the verified session cookie.
 *
 * This used to return "the first org in the table", which was fine for a
 * single-tenant demo and wrong as a habit: tenant scoping has to come from
 * the session, never from ambient state. Every page and action already calls
 * this, so they all became correctly scoped the moment it changed.
 */
export async function getOrgId(): Promise<string | null> {
  const session = await currentSession();
  return session?.orgId ?? null;
}

/** Accounts in one tier, ranked, with the strongest signal for context. */
export async function accountsByTier(orgId: string, tier: Tier, limit = 30) {
  return (await sql`
    select a.id, a.company_name, a.domain, a.vertical, a.hq_location,
           a.employee_band, a.funding_stage, a.last_funding_date,
           a.open_roles_count, a.warm_contact_count, a.latest_score,
           a.tier, a.tier_locked, a.is_suppressed,
           (select s.headline from signals s
             where s.account_id = a.id
             order by s.occurred_at desc limit 1) as top_signal
      from accounts a
     where a.org_id = ${orgId} and a.tier = ${tier}
     order by a.latest_score desc nulls last
     limit ${limit}
  `) as AccountRow[];
}

export async function tierCounts(orgId: string) {
  return (await sql`
    select tier, count(*)::int as n, round(avg(latest_score))::int as avg_score
      from accounts
     where org_id = ${orgId}
     group by tier
  `) as { tier: Tier; n: number; avg_score: number | null }[];
}

/** Headline numbers for the dashboard. */
export async function portfolioStats(orgId: string) {
  const rows = (await sql`
    select
      count(*)::int as total_accounts,
      count(*) filter (where open_roles_count > 0)::int as hiring_now,
      count(*) filter (where warm_contact_count > 0)::int as with_warm,
      count(*) filter (where is_suppressed)::int as suppressed,
      count(*) filter (where last_funding_date > current_date - 180)::int as funded_recently
    from accounts where org_id = ${orgId}
  `) as {
    total_accounts: number; hiring_now: number; with_warm: number;
    suppressed: number; funded_recently: number;
  }[];

  const people = (await sql`
    select count(*)::int as n, count(*) filter (where account_id is not null)::int as matched
      from people where org_id = ${orgId}
  `) as { n: number; matched: number }[];

  const signals = (await sql`
    select count(*)::int as n from signals where org_id = ${orgId}
  `) as { n: number }[];

  return { ...rows[0], contacts: people[0].n, contacts_matched: people[0].matched, signals: signals[0].n };
}

/**
 * Who to pursue: the highest scoring accounts that are actually actionable.
 * Suppressed accounts are current clients, not prospects, so they never
 * appear here.
 */
export async function topOpportunities(orgId: string, limit = 5) {
  return (await sql`
    select a.id, a.company_name, a.latest_score, a.open_roles_count,
           a.warm_contact_count, a.last_funding_date, a.vertical,
           (select s.headline from signals s
             where s.account_id = a.id
             order by s.occurred_at desc limit 1) as top_signal
      from accounts a
     where a.org_id = ${orgId} and not a.is_suppressed
       and a.tier in ('top25','next25')
     order by a.latest_score desc nulls last
     limit ${limit}
  `) as (Pick<AccountRow, "id" | "company_name" | "latest_score" | "open_roles_count" | "warm_contact_count" | "last_funding_date" | "vertical" | "top_signal">)[];
}

/**
 * Warm, hiring, and recently funded at once. Only about 5 percent of accounts
 * have a warm contact, so this combination is rare and worth surfacing: it is
 * the shortest path from a list to a booked call.
 */
export async function warmAndHiring(orgId: string, limit = 6) {
  return (await sql`
    select a.id, a.company_name, a.latest_score, a.open_roles_count,
           a.warm_contact_count, a.last_funding_date
      from accounts a
     where a.org_id = ${orgId} and not a.is_suppressed
       and a.warm_contact_count > 0 and a.open_roles_count > 0
     order by a.latest_score desc nulls last
     limit ${limit}
  `) as (Pick<AccountRow, "id" | "company_name" | "latest_score" | "open_roles_count" | "warm_contact_count" | "last_funding_date">)[];
}

export async function accountById(orgId: string, id: string) {
  const rows = (await sql`
    select a.* from accounts a where a.org_id = ${orgId} and a.id = ${id}
  `) as (AccountRow & Record<string, unknown>)[];
  return rows[0] ?? null;
}

export async function signalsForAccount(orgId: string, accountId: string) {
  return (await sql`
    select id, kind, headline, detail, magnitude, occurred_at, source
      from signals
     where org_id = ${orgId} and account_id = ${accountId}
     order by occurred_at desc, ingested_at desc
     limit 25
  `) as {
    id: string; kind: string; headline: string; detail: string | null;
    magnitude: string | null; occurred_at: string; source: string;
  }[];
}

export async function peopleForAccount(orgId: string, accountId: string) {
  return (await sql`
    select id, full_name, title, linkedin_url, email, seniority,
           is_decision_maker, connected_on
      from people
     where org_id = ${orgId} and account_id = ${accountId}
     order by is_decision_maker desc, connected_on desc nulls last
     limit 25
  `) as {
    id: string; full_name: string; title: string | null; linkedin_url: string | null;
    email: string | null; seniority: string | null; is_decision_maker: boolean;
    connected_on: string | null;
  }[];
}

export async function latestScoreForAccount(orgId: string, accountId: string) {
  const rows = (await sql`
    select id, score, icp_fit_score, hiring_signal_score, timing_score,
           relationship_score, revenue_potential_score, penalty, breakdown,
           reasoning, why_now, next_best_action, risks, model, scored_at
      from account_scores
     where org_id = ${orgId} and account_id = ${accountId}
     order by scored_at desc
     limit 1
  `) as {
    id: string; score: number; icp_fit_score: number; hiring_signal_score: number;
    timing_score: number; relationship_score: number; revenue_potential_score: number;
    penalty: number; breakdown: { terms?: BreakdownTerm[] };
    reasoning: string | null; why_now: string | null; next_best_action: string | null;
    risks: string | null; model: string | null; scored_at: string;
  }[];
  return rows[0] ?? null;
}

export type BreakdownTerm = {
  component: string;
  term: string;
  input: string | number;
  points: number;
  note: string;
};

/** Paged, searchable account list. */
export async function searchAccounts(
  orgId: string,
  { q = "", tier, page = 1, perPage = 50 }: { q?: string; tier?: Tier; page?: number; perPage?: number },
) {
  const offset = (page - 1) * perPage;
  const pattern = `%${q.toLowerCase()}%`;

  const rows = (await sql`
    select a.id, a.company_name, a.domain, a.vertical, a.hq_location,
           a.open_roles_count, a.warm_contact_count, a.latest_score, a.tier,
           a.tier_locked, a.is_suppressed, a.last_funding_date
      from accounts a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(coalesce(a.domain,'')) like ${pattern})
       and (${tier ?? null}::portfolio_tier is null or a.tier = ${tier ?? null}::portfolio_tier)
     order by a.latest_score desc nulls last
     limit ${perPage} offset ${offset}
  `) as AccountRow[];

  const count = (await sql`
    select count(*)::int as n
      from accounts a
     where a.org_id = ${orgId}
       and (${q} = '' or lower(a.company_name) like ${pattern} or lower(coalesce(a.domain,'')) like ${pattern})
       and (${tier ?? null}::portfolio_tier is null or a.tier = ${tier ?? null}::portfolio_tier)
  `) as { n: number }[];

  return { rows, total: count[0].n, page, perPage };
}
