-- Companies added by hand, from the app, when they are not in the TAM.
-- Location is kept on the account because the TAM never carried it and a
-- hand-added company arrives with it. Everything else already exists:
-- priority stays null (the master list scores, not the app), domain_source is
-- 'manual', and the record id is MAN-<n> so it cannot collide with a workbook
-- row on the next import.
alter table tam_accounts add column if not exists hq text;

-- The view carries it too, appended, which is the only shape create or replace view accepts.
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
       exists (select 1 from outreach_drafts d where d.account_id = a.id) as has_draft,
       (select max(d.sent_at) from outreach_drafts d where d.account_id = a.id) as last_contacted_at,
       (select count(*)::int from outreach_drafts d
         where d.account_id = a.id and d.sent_at is not null) as contacted_count,
       (select d.person_name from outreach_drafts d
         where d.account_id = a.id and d.sent_at is not null
         order by d.sent_at desc limit 1) as last_contacted_name,
       (select count(*)::int from account_notes n where n.account_id = a.id) as notes_count,
       (select n.body from account_notes n where n.account_id = a.id
         order by n.created_at desc limit 1) as last_note,
       a.hq
  from tam_accounts a;
