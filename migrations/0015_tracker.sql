-- The tracker. What Adrian did, recorded next to what the desk found.
--
-- Three things a reader of a company page wants to write down: a note (who
-- he spoke to, what they said), a mark (this checklist item is done, this
-- role has been mentioned), and a message (what he sent, or means to send,
-- to a named person). Notes append. Marks are one row per thing, toggled.
-- Messages reuse outreach_drafts, which already keys on account, person and
-- channel, plus a sent_at that records the human act of sending.

create table account_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid not null references tam_accounts(id) on delete cascade,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index account_notes_account on account_notes (org_id, account_id, created_at desc);

create table desk_marks (
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid not null references tam_accounts(id) on delete cascade,
  kind       text not null check (kind in ('check', 'role')),
  ref        text not null,
  done       boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (org_id, account_id, kind, ref)
);

alter table outreach_drafts
  add column if not exists sent_at timestamptz,
  add column if not exists custom  boolean not null default false;

-- The desk view gains the tracker columns. Appended at the end, which is the
-- only shape create or replace view accepts.
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
         order by n.created_at desc limit 1) as last_note
  from tam_accounts a;
