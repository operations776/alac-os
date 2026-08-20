-- The ALAC Desk Command Center model.
--
-- This replaces the portfolio model (accounts, account_scores, recommendations)
-- with the model the desk actually runs on. Two changes matter, and they are
-- the reason this is a replacement rather than an addition.
--
-- 1. Priority and Final Score are SOURCE DATA, not computed here. They are
--    finalized in the Master TAM and the operating instructions are explicit:
--    "Priority, Final Score, Record ID, Company, and LinkedIn are source data.
--    Do not change them." So there is no scorer writing to tam_accounts, no
--    tier column, and no tier recommendation queue. Top 25 and Next 25 are
--    derived by ranking (priority, final_score desc) at read time, which is
--    what the COMMAND BOARD does, so storing a tier would only let the stored
--    value drift away from the ranking.
--
-- 2. The computed score moves to heat. heat_signals carries a second, separate
--    100 point score built from six components, and it answers a different
--    question: not "is this account qualified" but "did something just happen
--    that changes the timing". heat_vs_tam, the delta between the two, is the
--    number the desk actually acts on.
--
-- people survives because the warm network is independent of the TAM and
-- nothing in the workbook replaces it. Its account_id is repointed and cleared,
-- and the importer rematches on normalized company name.

-- ---------------------------------------------------------------------------
-- Down: the portfolio model
-- ---------------------------------------------------------------------------

-- people.account_id points at accounts. Clear it before the table goes, so the
-- rematch starts from a known empty state rather than from dangling ids.
alter table people drop constraint if exists people_account_id_fkey;
update people set account_id = null where account_id is not null;

drop view if exists account_score_deltas;
drop table if exists recommendations;
drop table if exists account_scores;
drop table if exists activities;
drop table if exists signals;
drop table if exists accounts;

drop type if exists recommendation_kind;
drop type if exists recommendation_status;
drop type if exists signal_kind;
drop type if exists signal_direction;
drop type if exists activity_kind;
drop type if exists portfolio_tier;
drop type if exists defense_verdict;

-- ---------------------------------------------------------------------------
-- Up: the command center model
-- ---------------------------------------------------------------------------

-- Every enum below is quoted from the INSTRUCTIONS tab. The values are the
-- dropdown, exactly, so an import that meets a value not listed here fails
-- loudly instead of silently widening the vocabulary.

-- UNSCORED is a real state, not a missing value: a strategic account that is
-- on the Top or Next list but not yet finalized in the scored TAM. It is
-- excluded from Top 25 / Next 25 ranking by the instructions.
create type tam_priority as enum ('priority_1', 'priority_2', 'priority_3', 'unscored');

create type recommended_motion as enum ('TBD', 'LIVE LEAD', 'GENERAL BD', 'MPC WEDGE', 'NURTURE', 'HOLD');

-- Preparation stage only. It deliberately no longer doubles as execution
-- status, which is why heyreach and sourcewhale have their own columns.
-- READY FOR QC is itself the request for Adrian's decision, so there is no
-- separate QC flag.
create type prep_status as enum ('NOT STARTED', 'IN RESEARCH', 'READY FOR QC', 'APPROVED', 'HOLD');

-- Two execution layers, in order: HeyReach warms the network with connection
-- requests, then SourceWhale runs the BD sequence. They are separate columns
-- because merging them loses the ordering, which the instructions call the
-- SEQUENCE RULE.
create type heyreach_status as enum ('NOT LOADED', 'ACTIVE', 'COMPLETE');
create type sourcewhale_status as enum ('NOT LOADED', 'STAGED', 'ACTIVE', 'COMPLETE', 'HOLD');

create table tam_accounts (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- Source data. Never written by the app after import.
  record_id    text not null,
  priority     tam_priority,
  final_score  numeric(5,1),
  company_name text not null,
  norm_name    text not null,
  linkedin_url text,

  -- Action fields. These are the only columns the desk edits.
  next_week          boolean not null default false,
  sales_nav_url      text,
  battlecard_url     text,
  recommended_motion recommended_motion not null default 'TBD',
  prep_status        prep_status not null default 'NOT STARTED',
  next_action        text,

  -- Execution stage, one column per layer.
  heyreach_stage    heyreach_status not null default 'NOT LOADED',
  heyreach_date     date,
  heyreach_uploaded boolean not null default false,
  sourcewhale_stage sourcewhale_status not null default 'NOT LOADED',

  imported_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One company, one row. This is rule 1 of the operating instructions, and it
  -- is a unique constraint rather than a convention so a re-import cannot
  -- duplicate a company. It is also the conflict target for the importer:
  -- insert with conflict handling, never check then insert.
  constraint tam_accounts_record_uniq unique (org_id, record_id)
);

create index tam_accounts_rank_idx on tam_accounts (org_id, priority, final_score desc nulls last);
create index tam_accounts_next_week_idx on tam_accounts (org_id) where next_week;
create index tam_accounts_prep_idx on tam_accounts (org_id, prep_status);
create index tam_accounts_name_trgm_idx on tam_accounts using gin (norm_name gin_trgm_ops);

-- people is repointed at the new account table. on delete set null keeps a
-- contact when its company leaves the queue: the person is still someone the
-- desk knows.
alter table people
  add constraint people_account_id_fkey
  foreign key (account_id) references tam_accounts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Heat
-- ---------------------------------------------------------------------------

-- A signal is an event with a date and a source that changes outreach timing.
--
-- record_id is nullable on purpose. Roughly a third of the log is ALAC-SIG-*,
-- a company that produced a signal but is not in the scored TAM yet. Those are
-- the most interesting rows on the board, so the schema must hold a signal
-- that has no account, and the ranking must not drop it.
create table heat_signals (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  signal_key   text not null,
  company_name text not null,
  norm_name    text not null,
  account_id   uuid references tam_accounts(id) on delete set null,

  signal_date  date,
  what_happened text not null,
  the_number   text,
  hq           text,
  best_contact text,

  -- The six components. Each ceiling is fixed by the scoring model and stored
  -- here so the breakdown can be audited without consulting a spreadsheet.
  -- The check constraints are the ceilings: a component that over-earns is a
  -- scoring bug, and it fails at write time rather than showing a total that
  -- cannot be reconciled.
  hiring_urgency  integer check (hiring_urgency  between 0 and 30),
  icp_fit         integer check (icp_fit         between 0 and 20),
  capital         integer check (capital         between 0 and 15),
  talent_scarcity integer check (talent_scarcity between 0 and 15),
  access          integer check (access          between 0 and 10),
  freshness       integer check (freshness       between 0 and 10),

  -- The stored total as recorded. It is kept alongside the components rather
  -- than derived, so that the app can show both and say so when they disagree.
  -- A gap means the row was scored by a different model version than the
  -- components describe, and hiding it would make the audit trail a decoration.
  heat_score integer check (heat_score between 0 and 100),

  -- The delta against the TAM score, as recorded in the log. Positive means the
  -- signal is hotter than the account's standing qualification.
  tam_final_score numeric(5,1),
  heat_vs_tam     integer,

  recommended_move text,
  primary_source   text,
  last_scored      date,

  imported_at timestamptz not null default now(),

  constraint heat_signals_key_uniq unique (org_id, signal_key)
);

create index heat_signals_rank_idx on heat_signals (org_id, heat_score desc nulls last);
create index heat_signals_account_idx on heat_signals (org_id, account_id) where account_id is not null;
create index heat_signals_date_idx on heat_signals (org_id, signal_date desc nulls last);

-- ---------------------------------------------------------------------------
-- Performance
-- ---------------------------------------------------------------------------

-- One row per week, which is the grain SourceWhale reports at and the grain the
-- Thursday operating review runs on. Period rollups (WEEK / MONTH / QUARTER /
-- YEAR) are sums over this table at read time, so there is one source and no
-- second place for a metric to be entered.
--
-- Every counter is nullable. The instructions are explicit that a missing
-- number stays missing: "do not estimate missing activity". A null reads as
-- "not reported" on screen; a zero means SourceWhale reported zero.
create table performance_weeks (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  week_ending date not null,

  bd_calls             integer,
  client_conversations integer,
  discoveries          integer,
  qualified_opps       integer,
  commercial_asks      integer,
  searches_won         integer,
  pipeline_usd         bigint,
  placements           integer,

  -- The Thursday review. These are the reason the tab exists: the numbers are
  -- the evidence, this is the analysis.
  choke_point      text,
  evidence         text,
  hypothesis       text,
  countermeasure   text,
  marketing_brief  text,
  priority_1       text,
  priority_2       text,
  priority_3       text,
  research_tasking text,
  top_10_ready     boolean,

  imported_at timestamptz not null default now(),

  constraint performance_weeks_uniq unique (org_id, week_ending)
);

create index performance_weeks_idx on performance_weeks (org_id, week_ending desc);
