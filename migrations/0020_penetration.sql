-- Organization penetration, section 14, and SourceWhale coverage, 15.2.
--
-- Two things the brief asks for that the desk cannot currently answer: which
-- levels of an organization have actually been approached, and whether an
-- account is genuinely being worked in a campaign or merely sitting in one.

-- One row per account per organizational level. The status is set by hand
-- because it records a human act, and the person, date, channel and outcome
-- travel with it so the map explains itself rather than just colouring in.
create table org_touches (
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid not null references tam_accounts(id) on delete cascade,
  lane       text not null check (lane in
    ('executive', 'functional', 'hiring_leader', 'hiring_manager', 'talent', 'connector')),
  status     text not null default 'Untouched' check (status in
    ('Untouched', 'Attempted', 'Engaged', 'Closed', 'Available', 'Asked', 'Introduced', 'Declined')),
  person     text,
  channel    text,
  outcome    text,
  touched_at date,
  updated_at timestamptz not null default now(),
  primary key (org_id, account_id, lane)
);

-- SourceWhale, section 15.2. Never treat "in SourceWhale" as the same as
-- "actively being worked", which is the guardrail he states twice. Manual
-- until the API key arrives; the API fills the same columns.
alter table tam_accounts
  add column if not exists sw_state text
    check (sw_state in ('Not Added', 'Added', 'Active Campaign', 'Paused', 'Replied', 'Positive Reply', 'Completed')),
  add column if not exists sw_campaign text,
  add column if not exists sw_contacts integer,
  add column if not exists sw_last_activity date;

-- Disposition, section 9. Kept apart from prep_status on purpose: how far the
-- research got and whether the account should be worked at all are different
-- questions, and conflating them is what made Hold mean two things.
alter table tam_accounts
  add column if not exists disposition text not null default 'Active'
    check (disposition in ('Active', 'Hold', 'Nurture', 'Disqualified', 'Archived')),
  add column if not exists disposition_reason text,
  add column if not exists disposition_at timestamptz;

create index if not exists tam_accounts_disposition
  on tam_accounts (org_id, disposition)
  where disposition <> 'Active';

-- The desk view carries all three, so every screen reads one row per company.
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
        end) as effective_band,
       -- Section 9: how far the research got and whether the account should
       -- be worked at all are different questions.
       a.disposition, a.disposition_reason,
       -- Section 15.2: loaded is not the same as being worked.
       coalesce(a.sw_state, 'Not Added') as sw_state,
       a.sw_campaign, a.sw_contacts, a.sw_last_activity,
       -- Section 14. How many of the six levels have been approached, and
       -- how many are in a live conversation.
       (select count(*)::int from org_touches t
         where t.account_id = a.id and t.status in ('Attempted', 'Engaged', 'Introduced')) as lanes_touched,
       (select count(*)::int from org_touches t
         where t.account_id = a.id and t.status in ('Engaged', 'Introduced')) as lanes_engaged
  from tam_accounts a;
