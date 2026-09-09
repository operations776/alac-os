-- The owner-controlled portfolio, the cascade, and dead postings.
--
-- Adrian's clarification, 9 September: Top 25 and Next 25 are his working
-- portfolios. The system recommends companies for inclusion; he decides.
-- Until now the ranking decided membership and a pin was the exception. This
-- inverts it: membership is the pin, the ranking is the recommendation.
--
-- Nothing vanishes in the switch. Every company the ranking currently holds in
-- Work now or Up next is seeded as a pin, marked as seeded so the screen can
-- say so, and from here on the list only changes when he changes it.

update tam_accounts
   set pinned_band = work_band,
       pin_reason = 'Placed from the ranking when the list became yours, 9 Sep 2026',
       pinned_at = now(),
       pinned_by = 'seed'
 where work_band in ('now', 'next')
   and pinned_band is null
   and disposition = 'Active';

-- A company added by hand or by CSV that the refresh has not reached yet can
-- ask to be pulled on the next run whatever band it sits in.
alter table tam_accounts
  add column if not exists enrich_requested_at timestamptz;

-- Dead postings. PredictLeads reports last_seen_at on every role, so a posting
-- it has not seen for a week has come down. He hit several of these by hand;
-- nothing was reading the column. url_ok is a direct check on the employer's
-- page for the roles that actually surface.
alter table account_roles
  add column if not exists closed_at date,
  add column if not exists url_ok boolean,
  add column if not exists url_checked_at timestamptz;

create index if not exists account_roles_live
  on account_roles (org_id, relevance desc nulls last)
  where qualified and closed_at is null;

-- The desk view. Changed in place: effective_band now means the owner's
-- list, with the cascade applied, and the ranking's opinion is carried
-- beside it as recommended_for. Role counts exclude closed postings.
create or replace view account_desk as
select a.id, a.org_id, a.record_id, a.priority, a.final_score, a.company_name,
       a.linkedin_url, a.domain, a.next_week, a.sales_nav_url, a.battlecard_url,
       a.recommended_motion, a.prep_status, a.next_action,
       a.heyreach_stage, a.heyreach_date, a.heyreach_uploaded, a.sourcewhale_stage,
       a.work_band, a.work_reason, a.work_score, a.banded_at,
       (select max(h.heat_score) from heat_signals h
         where h.account_id = a.id and h.signal_date <= current_date) as heat_score,
       (select h.signal_date from heat_signals h
         where h.account_id = a.id and h.signal_date <= current_date
         order by h.signal_date desc nulls last limit 1) as signal_date,
       (select h.category from heat_signals h
         where h.account_id = a.id and h.signal_date <= current_date
         order by h.signal_date desc nulls last limit 1) as signal_category,
       (select h.what_happened from heat_signals h
         where h.account_id = a.id and h.signal_date <= current_date
         order by h.signal_date desc nulls last limit 1) as signal_text,
       (select count(*)::int from account_roles r
         where r.account_id = a.id and r.qualified and r.closed_at is null) as qualified_roles,
       (select count(*)::int from account_roles r
         where r.account_id = a.id and r.qualified and r.closed_at is null
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
       (a.pinned_band is not null
         and (a.pin_expires is null or a.pin_expires >= current_date)) as pin_active,
       -- The owner's list, with the cascade applied. Section 9.1 and his
       -- clarification: Hold and Nurture leave the working list but keep the
       -- pin, so releasing them puts them back where they were; Disqualified
       -- and Archived are out of every list.
       (case
          when a.disposition in ('Disqualified', 'Archived') then null
          when a.disposition in ('Hold', 'Nurture') then 'backlog'
          when a.pinned_band is not null
           and (a.pin_expires is null or a.pin_expires >= current_date)
          then (case when a.pinned_band = 'bench' then 'backlog' else a.pinned_band end)
          else 'backlog'
        end) as effective_band,
       a.disposition, a.disposition_reason,
       coalesce(a.sw_state, 'Not Added') as sw_state,
       a.sw_campaign, a.sw_contacts, a.sw_last_activity,
       (select count(*)::int from org_touches t
         where t.account_id = a.id and t.status in ('Attempted', 'Engaged', 'Introduced')) as lanes_touched,
       (select count(*)::int from org_touches t
         where t.account_id = a.id and t.status in ('Engaged', 'Introduced')) as lanes_engaged,
       a.pinned_by,
       -- What the ranking would do that the owner has not: a company the
       -- system puts in a working band that he has not placed there, and has
       -- not declined. Null otherwise, so the screen can list exactly these.
       -- Only additions are recommended. A company already on the list is
       -- his to move; suggesting he demote it would be the ranking deciding
       -- what he works on by another route.
       (case
          when a.disposition <> 'Active' then null
          when a.work_band not in ('now', 'next') then null
          when a.pinned_band is not null
           and (a.pin_expires is null or a.pin_expires >= current_date) then null
          else a.work_band
        end) as recommended_for,
       -- More urgent than its rank, section 16: the biggest gap between a
       -- recent signal's heat and the standing fit score, and the signal.
       (select max(h.heat_vs_tam) from heat_signals h
         where h.account_id = a.id and h.heat_vs_tam > 0
           and h.signal_date between current_date - 30 and current_date) as hot_delta,
       (select h.what_happened from heat_signals h
         where h.account_id = a.id and h.heat_vs_tam > 0
           and h.signal_date between current_date - 30 and current_date
         order by h.heat_vs_tam desc limit 1) as hot_signal,
       a.enrich_requested_at
  from tam_accounts a;
