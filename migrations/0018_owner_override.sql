-- Owner override. Section 8 of the brief, and its loudest requirement:
-- "The OS never silently moves a manually locked company."
--
-- The system rank stays exactly where it was, computed by map-market on every
-- refresh. This sits beside it. Both are shown together, always, so the
-- operator can see what the machine thinks and what he decided.
alter table tam_accounts
  add column if not exists pinned_band  text
    check (pinned_band in ('now', 'next', 'bench')),
  add column if not exists pinned_rank  integer check (pinned_rank between 1 and 999),
  add column if not exists pin_reason   text,
  add column if not exists pin_expires  date,
  add column if not exists pinned_at    timestamptz,
  add column if not exists pinned_by    text;

-- A pinned company is read on every board, so the partial index is worth it.
create index if not exists tam_accounts_pinned
  on tam_accounts (org_id, pinned_band, pinned_rank)
  where pinned_band is not null;

-- The desk view carries the override alongside the computed band, so every
-- screen can show "Manual #3 / System #17" without a second query.
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
       a.hq,
       a.pinned_band, a.pinned_rank, a.pin_reason, a.pin_expires, a.pinned_at,
       -- An expired pin stops applying but is not erased: the reason and date
       -- stay readable, and Release is still the only thing that clears it.
       (a.pinned_band is not null
         and (a.pin_expires is null or a.pin_expires >= current_date)) as pin_active,
       -- What the operator actually sees as the band. The pin wins while live.
       (case
          when a.pinned_band is not null
           and (a.pin_expires is null or a.pin_expires >= current_date)
          then (case when a.pinned_band = 'bench' then 'backlog' else a.pinned_band end)
          else a.work_band
        end) as effective_band
  from tam_accounts a;
