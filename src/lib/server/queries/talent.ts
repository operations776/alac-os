import "server-only";
import { sql } from "@/lib/server/db";
import { matchRole, bucketResults, parseQuery, tokens } from "@/lib/scoring/match.mjs";

/**
 * The Demand Radar. Section 21 of the brief.
 *
 * Search the requisitions ALAC has already scraped, for one candidate. The
 * corpus is the point: 4,000 qualified roles already sit in this database, so
 * this asks a question of what we hold rather than launching a new search.
 */

export type Candidate = {
  id: string;
  full_name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedin_url: string | null;
  summary: string | null;
  domains: string | null;
  geography: string | null;
  clearance: string | null;
  comp_target: string | null;
  mpc_score: number | null;
  active: boolean;
  created_at: string;
};

export async function candidates(orgId: string) {
  return (await sql`
    select * from candidates
     where org_id = ${orgId} and active
     order by mpc_score desc nulls last, created_at desc
     limit 100
  `) as Candidate[];
}

export async function candidateById(orgId: string, id: string) {
  const rows = (await sql`
    select * from candidates where org_id = ${orgId} and id = ${id} limit 1
  `) as Candidate[];
  return rows[0] ?? null;
}

export type RadarAccount = {
  id: string;
  company_name: string;
  work_band: string | null;
  work_score: number | null;
  heat_score: number | null;
  signal_text: string | null;
  signal_date: string | null;
  domain: string | null;
  top_contact: string | null;
  top_contact_title: string | null;
};

export type RadarRole = {
  id: string;
  account_id: string;
  company_name: string;
  work_band: string | null;
  title: string;
  url: string | null;
  location: string | null;
  salary_text: string | null;
  occupation: string | null;
  job_function: string | null;
  first_seen: string | null;
  relevance: number | null;
  open_at_company: number;
  signal_text: string | null;
  heat_score: number | null;
  match: { score: number; why: string[]; flags: string[] };
  pitched: boolean;
};

/**
 * Score every qualified requisition against one candidate, then bucket.
 *
 * The whole corpus is read and scored in memory. At 4,000 roles that is a few
 * milliseconds and it keeps the matcher one pure function that can be tested,
 * rather than scoring logic smeared across SQL where nobody can see it.
 */
export async function radar(
  orgId: string,
  candidate: Candidate,
  opts: { q?: string; minScore?: number; minAge?: number; band?: string } = {},
) {
  const parsed = parseQuery(opts.q ?? "");
  // The typed query refines the candidate rather than replacing them: the
  // producer can broaden or narrow regardless of what classification said.
  const subject = {
    title: parsed.level ? `${parsed.level} ${candidate.title ?? ""}` : candidate.title,
    summary: `${candidate.summary ?? ""} ${opts.q ?? ""}`,
    domains: candidate.domains,
    geography: parsed.geography ?? candidate.geography,
    clearance: candidate.clearance,
  };
  const subjectTokens = tokens(
    `${subject.title ?? ""} ${subject.summary ?? ""} ${subject.domains ?? ""}`,
  );

  const roles = (await sql`
    select r.id, r.account_id, a.company_name, a.effective_band as work_band,
           r.title, r.url, r.location, r.salary_text, r.occupation, r.job_function,
           r.first_seen, r.relevance,
           a.qualified_roles as open_at_company,
           a.signal_text, a.heat_score,
           exists (select 1 from candidate_pitches p
                    where p.candidate_id = ${candidate.id} and p.role_id = r.id) as pitched
      from account_roles r
      join account_desk a on a.id = r.account_id
     where r.org_id = ${orgId} and r.qualified
       and a.prep_status <> 'HOLD'
     order by r.relevance desc nulls last
     limit 4000
  `) as Omit<RadarRole, "match">[];

  const minAge = opts.minAge ?? parsed.minAge;
  const minScore = opts.minScore ?? parsed.minScore ?? 0;
  const now = Date.now();

  const scored: RadarRole[] = [];
  for (const r of roles) {
    if (opts.band && r.work_band !== opts.band) continue;
    if (minAge && r.first_seen) {
      const age = Math.floor((now - new Date(r.first_seen).getTime()) / 86_400_000);
      if (age < minAge) continue;
    }
    const match = matchRole({ ...subject, tokens: subjectTokens }, r);
    if (match.score < minScore) continue;
    scored.push({ ...r, match });
  }
  scored.sort((a, b) => b.match.score - a.match.score || (b.relevance ?? 0) - (a.relevance ?? 0));

  // Accounts, for the two buckets that do not come from requisitions at all.
  const accounts = (await sql`
    select id, company_name, work_band, work_score, heat_score, signal_text,
           signal_date, domain, top_contact, top_contact_title
      from account_desk
     where org_id = ${orgId} and effective_band in ('now', 'next')
       and prep_status <> 'HOLD'
  `) as RadarAccount[];

  const buckets = bucketResults(scored, accounts) as {
    exact: RadarRole[];
    adjacent: RadarRole[];
    implied: RadarAccount[];
    strategic: RadarAccount[];
  };
  return { ...buckets, parsed, total: scored.length };
}
