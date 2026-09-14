// What the first message writer is given for one company and one person.
//
// Shared by `npm run draft` and the desk's Message dialog, so both write from
// the identical context. Two copies of this assembly would drift, and then the
// message a script drafts differs from the one the screen drafts for the same
// person with nothing to say why.
//
// No connection here. The caller passes `query(text, params) => rows`: the
// script its pg Pool, the app the desk `sql.query`. Tenant scoping is the
// caller's orgId, which in the app comes from the session.

/**
 * How relevant a known contact is to a recruiting approach.
 *
 * Ranking on the decision maker flag alone does not work: nearly every senior
 * contact carries it, so they tie, and the tiebreak is alphabetical. At
 * Acme Aerospace that put a Head of Marketing at the top of a company hiring twenty
 * engineers. Marketing does not own the requisition.
 *
 * Mirrors the SQL in targetsForAccount. The two must agree, or the person the
 * message is written to differs from the person shown at the top of the screen.
 */
export function warmRank(p) {
  const t = String(p.title ?? "").toLowerCase();
  if (/talent|recruit|people ops|head of people/.test(t)) return 95;
  if (/engineer|technical|cto|chief technology/.test(t)) return 88;
  if (/chief|founder|ceo|coo|president/.test(t)) return 82;
  if (/program|product|operations/.test(t)) return 74;
  return p.is_decision_maker ? 70 : 55;
}

/**
 * Read everything the writer may use for one account.
 *
 * `account` is `{ id, company_name, domain, employee_count }`, already checked
 * to belong to `orgId`. `personName` picks the contact: an exact name first,
 * then the first ranked contact whose name contains it, then (with no name)
 * the best ranked contact.
 *
 * Returns `{ signals, person, input }`. `input` is the argument for
 * writeFirstMessage; `person` is null when nobody matches, and then there is
 * nothing grounded to write.
 *
 * @param {(text: string, params: unknown[]) => Promise<any[]>} query
 * @param {string} orgId
 * @param {{ id: string, company_name: string, domain: string | null, employee_count: number | null }} account
 * @param {string | null} [personName]
 */
export async function buildOutreachContext(query, orgId, account, personName = null) {
  const [signals, roles, targets, warm, stats] = await Promise.all([
    query(
      `select id, what_happened, the_number, signal_date, source::text as source, detail
         from heat_signals where org_id=$1 and account_id=$2
        order by heat_score desc nulls last limit 3`,
      [orgId, account.id],
    ),
    query(
      `select title, location, job_function, posted_at from account_roles
        where org_id=$1 and account_id=$2 and qualified
        order by posted_at desc nulls last limit 12`,
      [orgId, account.id],
    ),
    query(
      `select id, full_name, title, linkedin_url, is_warm, rank_score
         from account_targets where org_id=$1 and account_id=$2
        order by rank_score desc nulls last`,
      [orgId, account.id],
    ),
    query(
      `select full_name, title, linkedin_url, is_decision_maker
         from people where org_id=$1 and account_id=$2
        order by is_decision_maker desc limit 8`,
      [orgId, account.id],
    ),
    // Counted over every qualified role, because the roles query above is
    // capped at 12 for the prompt and a count off that sample would state
    // "12 open roles" for a company with 44.
    query(
      `select count(*)::int as total,
              count(distinct location) filter (where location is not null)::int as sites,
              count(distinct job_function) filter (where job_function is not null)::int as fns,
              array_agg(distinct location) filter (where location is not null) as locations
         from account_roles where org_id=$1 and account_id=$2 and qualified`,
      [orgId, account.id],
    ),
  ]);

  // Warm contacts first: someone who will recognise the sender is a better
  // first message than a stranger with a better title.
  const pool = [
    ...warm.map((w) => ({
      full_name: w.full_name,
      title: w.title,
      linkedin_url: w.linkedin_url,
      is_warm: true,
      rank: warmRank(w),
      id: null,
    })),
    ...targets.map((t) => ({
      full_name: t.full_name,
      title: t.title,
      linkedin_url: t.linkedin_url,
      is_warm: t.is_warm,
      rank: t.rank_score ?? 0,
      id: t.id,
    })),
  ].sort((x, y) => y.rank - x.rank);

  // Exact before contains, or "Ann Lee" would pick a higher ranked "Joann Lee".
  const wanted = personName?.toLowerCase();
  const person = wanted
    ? (pool.find((p) => p.full_name.toLowerCase() === wanted) ??
      pool.find((p) => p.full_name.toLowerCase().includes(wanted)) ??
      null)
    : (pool[0] ?? null);

  const s = stats[0];
  return {
    signals,
    person,
    input: {
      company: { name: account.company_name, domain: account.domain, employees: account.employee_count },
      person,
      signals,
      roles,
      warmContacts: warm,
      roleStats: s
        ? {
            total: Number(s.total),
            sites: Number(s.sites),
            functions: Number(s.fns),
            locations: s.locations ?? [],
          }
        : null,
    },
  };
}
