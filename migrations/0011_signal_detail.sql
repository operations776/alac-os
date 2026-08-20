-- Fuller explanations of what changed, and the drafted first message.
--
-- Signals from the workbook are written by hand and read well: "$50M Space
-- Force OTA for Whirlwind maneuverability system, largest award in company
-- history, ~4x capital raised to date". Signals from the tracker do not: Fiber
-- returns "Series B: $13M raised", which says an event happened without saying
-- anything about it.
--
-- `detail` holds the researched expansion, so the automated feed can reach the
-- standard the hand written ones already set. `sources` holds the URLs behind
-- it, because an explanation nobody can check is just a longer claim.
alter table heat_signals
  add column detail text,
  add column sources jsonb not null default '[]'::jsonb,
  add column detail_model text,
  add column detailed_at timestamptz;

-- The drafted opening message, per person.
--
-- One row per target rather than per account: the whole point is that the
-- message could not have been sent to anybody else, so it belongs to the
-- person, not the company.
create table outreach_drafts (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  account_id uuid not null references tam_accounts(id) on delete cascade,
  target_id  uuid references account_targets(id) on delete cascade,
  -- Kept alongside the id so a draft still names its recipient after a target
  -- row is replaced by a re-source.
  person_name text not null,

  channel text not null default 'linkedin' check (channel in ('linkedin', 'email')),
  body    text not null,
  opening_line text,
  why_this_angle text,

  -- The facts the message leaned on, and the URLs behind them. A reviewer
  -- should be able to check every claim without leaving the page, which is the
  -- difference between reviewing a draft and trusting it.
  facts_used jsonb not null default '[]'::jsonb,
  sources    jsonb not null default '[]'::jsonb,

  model      text,
  drafted_at timestamptz not null default now(),
  -- Nothing here sends. This records that a human read it.
  approved   boolean not null default false,

  constraint outreach_drafts_uniq unique (org_id, account_id, person_name, channel)
);

create index outreach_drafts_account_idx on outreach_drafts (org_id, account_id);
