import "server-only";

import { sql, tx } from "@/lib/server/db";

export interface PendingRecommendation {
  id: string;
  account_id: string;
  company_name: string;
  kind: string;
  from_tier: string | null;
  to_tier: string | null;
  headline: string;
  rationale: string;
  confidence: number | null;
  created_at: string;
  expires_at: string;
  score: number | null;
  why_now: string | null;
  next_best_action: string | null;
  risks: string | null;
  open_roles_count: number | null;
  warm_contact_count: number | null;
  defense_verdict: string | null;
  hq_location: string | null;
}

/**
 * The queue Adrian clears on a Friday. Ordered by confidence so the clearest
 * calls come first, and carrying the reasoning alongside so he never has to
 * open another page to decide.
 */
export async function pendingRecommendations(
  orgId: string,
): Promise<PendingRecommendation[]> {
  return (await sql`
    with latest as (
      select distinct on (account_id)
             account_id, score, why_now, next_best_action, risks
        from account_scores
       where org_id = ${orgId}
       order by account_id, scored_at desc
    )
    select r.id, r.account_id, a.company_name, r.kind::text as kind,
           r.from_tier::text as from_tier, r.to_tier::text as to_tier,
           r.headline, r.rationale, r.confidence,
           r.created_at, r.expires_at,
           l.score, l.why_now, l.next_best_action, l.risks,
           a.open_roles_count, a.warm_contact_count,
           a.defense_verdict, a.hq_location
      from recommendations r
      join accounts a on a.id = r.account_id
      left join latest l on l.account_id = r.account_id
     where r.org_id = ${orgId}
       and r.status = 'pending'
       and r.expires_at > now()
     order by r.confidence desc nulls last, r.created_at
  `) as PendingRecommendation[];
}

export interface ReviewCounts {
  pending: number;
  approved_30d: number;
  rejected_30d: number;
  expired: number;
}

export async function reviewCounts(orgId: string): Promise<ReviewCounts> {
  const [row] = (await sql`
    select
      count(*) filter (where status = 'pending' and expires_at > now())::int as pending,
      count(*) filter (where status = 'approved' and resolved_at > now() - interval '30 days')::int as approved_30d,
      count(*) filter (where status = 'rejected' and resolved_at > now() - interval '30 days')::int as rejected_30d,
      count(*) filter (where status = 'pending' and expires_at <= now())::int as expired
    from recommendations
   where org_id = ${orgId}
  `) as ReviewCounts[];
  return row ?? { pending: 0, approved_30d: 0, rejected_30d: 0, expired: 0 };
}

/**
 * Approving a tier recommendation writes two tables: the recommendation is
 * resolved and the account's tier moves. That is a single transaction, per
 * data law 1, because an approved recommendation whose account never moved is
 * a lie the UI would happily render.
 *
 * The status guard in the where clause is the race guard: two clicks resolve
 * once. Returns false when the row was already resolved by someone else.
 */
export async function approveRecommendation(
  orgId: string,
  recommendationId: string,
  userId: string | null,
): Promise<boolean> {
  return tx(async (client) => {
    const { rows } = await client.query(
      `update recommendations
          set status = 'approved', resolved_at = now(), resolved_by = $3
        where id = $2 and org_id = $1 and status = 'pending'
        returning account_id, kind::text as kind, to_tier::text as to_tier`,
      [orgId, recommendationId, userId],
    );
    if (!rows.length) return false;

    const rec = rows[0];
    if (rec.kind === "promote_tier" || rec.kind === "demote_tier") {
      await client.query(
        `update accounts
            set tier = $3::portfolio_tier, tier_set_at = now(), tier_set_by = $4
          where id = $2 and org_id = $1`,
        [orgId, rec.account_id, rec.to_tier, userId],
      );
    }
    return true;
  });
}

/**
 * Rejecting writes one table, so no transaction is needed. The note is the
 * valuable part: phase 3 feeds these back as few-shot examples so the engine
 * learns Adrian's judgement rather than repeating the same bad call.
 */
export async function rejectRecommendation(
  orgId: string,
  recommendationId: string,
  userId: string | null,
  note: string | null,
): Promise<boolean> {
  const rows = await sql`
    update recommendations
       set status = 'rejected', resolved_at = now(), resolved_by = ${userId},
           decision_note = ${note}
     where id = ${recommendationId} and org_id = ${orgId} and status = 'pending'
     returning id
  `;
  return rows.length > 0;
}
