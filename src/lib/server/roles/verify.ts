import "server-only";
import { sql } from "@/lib/server/db";
import { DESK } from "@/config/desk.mjs";

/**
 * Check that the roles on screen are still open.
 *
 * One definition, called three ways: by the button on Open roles, by the
 * scheduled route, and by the command line script. It lived only in a script
 * on one laptop, which meant the app could not answer "is this still open"
 * on its own.
 *
 * What it can and cannot tell you, stated because the answer is recorded as
 * fact: Greenhouse and Lever return 404 for a filled role, which is a real
 * answer and closes the posting. A board that keeps dead pages up returns
 * 200, and that is a limit of the check rather than a claim the role is
 * open. Anything unreachable is recorded as unknown and never as dead: a
 * timeout is our problem, not evidence about the employer.
 */

export type VerifyResult = {
  checked: number;
  live: number;
  gone: number;
  unknown: number;
  onToday: number;
  closed: { company: string; title: string }[];
};

type Candidate = {
  id: string;
  url: string;
  company_name: string;
  title: string;
  on_today: boolean;
};

/**
 * The roles the screens actually offer.
 *
 * Two sets, because the screens ask two questions: Today gates a live lead
 * on how hard the role is to fill, since a role posted this week has no age
 * to compound, and the month view gates on the full commercial score.
 * Checking only one of them left every role on Today unverified.
 */
async function candidates(orgId: string, all: boolean, limit: number) {
  return (await sql`
    select r.id, r.url, a.company_name, r.title,
           (r.first_seen >= current_date - ${DESK.ROLE_FRESH_DAYS}::int
             and r.difficulty >= ${DESK.LEAD_MIN_DIFFICULTY}) as on_today
      from account_roles r
      join account_desk a on a.id = r.account_id
     where r.org_id = ${orgId} and r.qualified and r.closed_at is null
       and r.url is not null and a.disposition = 'Active'
       and (${all} or r.url_checked_at is null or r.url_checked_at < now() - interval '3 days')
       and (
         (r.first_seen >= current_date - ${DESK.ROLE_FRESH_DAYS}::int
           and r.difficulty >= ${DESK.LEAD_MIN_DIFFICULTY})
         or r.relevance >= (select percentile_cont(0.9) within group (order by relevance)
                              from account_roles
                             where org_id = ${orgId} and qualified and closed_at is null
                               and relevance is not null)
       )
     order by (r.first_seen >= current_date - ${DESK.ROLE_FRESH_DAYS}::int) desc,
              r.relevance desc nulls last
     limit ${limit}
  `) as Candidate[];
}

/** One page. Null means we could not tell, which is not the same as gone. */
async function isAlive(url: string): Promise<boolean | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    // Some boards refuse HEAD outright. A GET is the honest fallback.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    clearTimeout(t);
    return res.status < 400;
  } catch {
    return null;
  }
}

export async function verifyRoles(
  orgId: string,
  { all = false, limit = 120 }: { all?: boolean; limit?: number } = {},
): Promise<VerifyResult> {
  const rows = await candidates(orgId, all, limit);
  const out: VerifyResult = {
    checked: rows.length,
    live: 0,
    gone: 0,
    unknown: 0,
    onToday: rows.filter((r) => r.on_today).length,
    closed: [],
  };

  const one = async (r: Candidate) => {
    const alive = await isAlive(r.url);
    if (alive === true) out.live += 1;
    else if (alive === false) {
      out.gone += 1;
      out.closed.push({ company: r.company_name, title: r.title });
    } else out.unknown += 1;

    await sql`
      update account_roles
         set url_ok = ${alive},
             url_checked_at = now(),
             closed_at = case when ${alive} = false then current_date else closed_at end
       where id = ${r.id}
    `;
  };

  // Eight at a time: fast enough that a button press finishes inside a
  // request, few enough that no employer's board sees a burst from one
  // address.
  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(rows.slice(i, i + 8).map(one));
  }
  return out;
}
