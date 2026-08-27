-- Commercial relevance of a role, out of 100, computed by
-- src/lib/scoring/roles.mjs on every pull: freshness, seniority, discipline
-- fit and whether a salary is published. Stored so the desk can rank roles
-- rather than list them, and recomputed each refresh because it decays.
alter table account_roles add column if not exists relevance integer;
create index if not exists account_roles_relevance
  on account_roles (org_id, relevance desc nulls last)
  where qualified;

-- One row per account with everything the next move needs. Four queries
-- carried the same eight subselects; the view carries them once, so the
-- Today board, Who to target, the account page and the signal board all
-- describe a company with the same numbers.
create or replace view account_desk as
select a.id, a.org_id, a.record_id, a.priority, a.final_score, a.company_name,
       a.linkedin_url, a.domain, a.next_week, a.sales_nav_url, a.battlecard_url,
       a.recommended_motion, a.prep_status, a.next_action,
       a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded, a.sourcewhale_stage,
       a.work_band, a.work_reason, a.work_score, a.banded_at,
       (select max(h.heat_score) from heat_signals h where h.account_id = a.id) as heat_score,
       (select h.signal_date from heat_signals h where h.account_id = a.id
         order by h.signal_date desc nulls last limit 1) as signal_date,
       (select h.category from heat_signals h where h.account_id = a.id
         order by h.signal_date desc nulls last limit 1) as signal_category,
       (select h.what_happened from heat_signals h where h.account_id = a.id
         order by h.signal_date desc nulls last limit 1) as signal_text,
       (select count(*)::int from account_roles r
         where r.account_id = a.id and r.qualified) as qualified_roles,
       (select count(*)::int from account_roles r
         where r.account_id = a.id and r.qualified
           and r.first_seen >= current_date - 7) as fresh_roles,
       (select count(*)::int from people p where p.account_id = a.id) as warm_contacts,
       (select count(*)::int from people p
         where p.account_id = a.id and p.is_decision_maker) as decision_makers,
       (select count(*)::int from account_targets t where t.account_id = a.id) as targets,
       coalesce(
         (select t.full_name from account_targets t where t.account_id = a.id
           order by t.rank_score desc nulls last limit 1),
         (select p.full_name from people p where p.account_id = a.id
           order by p.is_decision_maker desc,
                    (p.title ~* 'talent|recruit|engineer|technical|cto|chief|founder') desc,
                    p.full_name limit 1)
       ) as top_contact,
       coalesce(
         (select t.title from account_targets t where t.account_id = a.id
           order by t.rank_score desc nulls last limit 1),
         (select p.title from people p where p.account_id = a.id
           order by p.is_decision_maker desc,
                    (p.title ~* 'talent|recruit|engineer|technical|cto|chief|founder') desc,
                    p.full_name limit 1)
       ) as top_contact_title,
       exists (select 1 from outreach_drafts d where d.account_id = a.id) as has_draft
  from tam_accounts a;
