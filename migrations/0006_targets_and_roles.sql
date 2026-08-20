-- Who to contact, and what they are hiring for.
--
-- The desk's question is not "which account" but "which person, today, and why".
-- Two tables answer it.
--
-- account_targets is people sourced from a vendor: senior leaders and talent
-- owners at an account. It is deliberately NOT the people table. `people` is
-- the warm network, a LinkedIn first degree export of humans Adrian actually
-- knows, and mixing bought contacts into it would destroy the one property
-- that makes it valuable: everyone in it can be approached without an
-- introduction. The target list reads both and says which is which.
--
-- account_roles is the open requisitions behind a hiring signal. They are the
-- reason to call, and they feed the two heat components that currently report
-- as gaps.

create type target_source as enum ('prospeo', 'fiber', 'manual');

create table account_targets (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  account_id uuid not null references tam_accounts(id) on delete cascade,

  source      target_source not null,
  external_id text,

  full_name    text not null,
  title        text,
  headline     text,
  linkedin_url text,
  location     text,

  -- Email is three states, not two. A verified address that has not been
  -- revealed is a real asset that costs extra to expose, and that is different
  -- from having no address at all. Collapsing them would hide a reachable
  -- person behind an apparent gap.
  email          text,
  email_status   text,
  email_revealed boolean not null default false,

  -- Deterministic relevance, with the terms that produced it. Same contract as
  -- the heat scorer: a rank with no stated reason is not reviewable.
  rank_score integer check (rank_score between 0 and 100),
  rank_terms jsonb not null default '[]'::jsonb,

  -- True when this person also appears in the warm network. Set at write time
  -- by matching on LinkedIn URL, because "you already know this person" is the
  -- single most useful fact on the row.
  is_warm boolean not null default false,

  fetched_at timestamptz not null default now(),

  -- One person per account. LinkedIn URL is the natural key and is stable
  -- across a title change, which a name is not.
  constraint account_targets_uniq unique (org_id, account_id, linkedin_url)
);

create index account_targets_rank_idx on account_targets (org_id, account_id, rank_score desc nulls last);
create index account_targets_warm_idx on account_targets (org_id, account_id) where is_warm;

-- Open requisitions. The evidence behind a hiring signal, and the input the
-- hiring_urgency and talent_scarcity components need.
create table account_roles (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  account_id uuid not null references tam_accounts(id) on delete cascade,

  external_id text,
  title       text not null,
  url         text,
  location    text,
  seniority   text,
  job_function text,
  posted_at   date,

  -- Whether this is a role ALAC would actually be engaged on. Set by the
  -- qualifier, and false is meaningful: an office manager opening is a real
  -- posting that should not lift a hiring score.
  qualified boolean not null default true,

  fetched_at timestamptz not null default now(),

  constraint account_roles_uniq unique (org_id, account_id, external_id)
);

create index account_roles_account_idx on account_roles (org_id, account_id, posted_at desc nulls last);
create index account_roles_qualified_idx on account_roles (org_id, account_id) where qualified;

-- The generated narrative, kept beside the signal it explains.
--
-- Separate columns rather than free text, because each answers one of Adrian's
-- questions and the screen renders them in a fixed order. A model that returns
-- prose for "who to contact first" instead of a name is failing the schema,
-- and a forced schema is how that gets caught.
alter table heat_signals
  add column why_now text,
  add column contact_first text,
  add column next_step text,
  add column risks text,
  add column reasoning_model text,
  add column reasoning_at timestamptz;
