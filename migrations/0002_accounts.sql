-- Accounts, people, signals, suppressions: the objects the portfolio is built
-- from. Tenancy is enforced in server code, so every table carries org_id and
-- every index leads with it. ARCHITECTURE.md section 3.

create type portfolio_tier as enum ('top25', 'next25', 'watch', 'removed', 'unassigned');
create type defense_verdict as enum ('FIT', 'MAYBE', 'NO');

create table accounts (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- Identity. norm_domain is the dedupe key and the import conflict target:
  -- it is unique across the whole source export, so it is a safe natural key.
  company_name text not null,
  norm_name    text not null,
  domain       text,
  norm_domain  text,
  linkedin_url text,

  -- Portfolio state
  tier        portfolio_tier not null default 'unassigned',
  tier_set_at timestamptz not null default now(),
  tier_set_by uuid references users(id) on delete set null,
  -- A human pin. The engine may never demote a locked account, which is what
  -- keeps the recommendation queue trustworthy rather than noisy.
  tier_locked boolean not null default false,

  -- Firmographics
  vertical          text,
  employee_band     text,
  employee_midpoint integer,
  hq_location       text,
  hq_state          text,
  founded_year      integer,
  funding_stage     text,
  last_funding_date date,
  -- Source data holds currency strings in two formats, "$1,100,000" and $7.7M.
  -- Both are parsed to integer dollars at import so they can be compared.
  last_funding_amount_usd bigint,
  total_funding_usd       bigint,
  open_roles_count  integer not null default 0 check (open_roles_count >= 0),
  defense_alignment text,
  defense_verdict   defense_verdict,
  -- Kept for reference, never ranked on: it is a bucket label, not a score.
  -- Half the source file shares one value. ARCHITECTURE.md section 5.
  source_priority_score integer,
  on_existing_list  boolean not null default false,
  naics             text,
  keyword_tags      text[],
  description       text,
  source            text,

  -- Suppression: an existing client. Stays visible as a farmable account but is
  -- blocked from cold outreach.
  is_suppressed      boolean not null default false,
  suppression_reason text,

  -- Rollups maintained by writers, never by the client.
  latest_score       integer check (latest_score is null or latest_score between 0 and 100),
  latest_score_at    timestamptz,
  warm_contact_count integer not null default 0 check (warm_contact_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Race guards are unique constraints, never check-then-insert. Data law 2.
create unique index accounts_org_domain_uniq on accounts (org_id, norm_domain)
  where norm_domain is not null;
-- Fallback identity for rows that arrive without a domain, mostly contacts
-- whose company never appeared in the export.
create unique index accounts_org_name_uniq on accounts (org_id, norm_name)
  where norm_domain is null;

create index accounts_tier_idx    on accounts (org_id, tier, latest_score desc nulls last);
create index accounts_score_idx   on accounts (org_id, latest_score desc nulls last);
create index accounts_funding_idx on accounts (org_id, last_funding_date desc nulls last);
create index accounts_roles_idx   on accounts (org_id, open_roles_count desc) where open_roles_count > 0;
-- Fuzzy company matching when importing contacts, and the search box.
create index accounts_name_trgm_idx on accounts using gin (norm_name gin_trgm_ops);

create type person_segment as enum ('buyer', 'referrer', 'military', 'candidate', 'suppress', 'other');

create table people (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,

  full_name    text not null,
  title        text,
  company_text text,
  norm_company text,
  linkedin_url text,
  email        text,
  segment      person_segment not null default 'other',

  -- Relationship signal. Connection recency is a real scoring input.
  is_first_degree   boolean not null default false,
  connected_on      date,
  icp_company_flag  boolean not null default false,
  seniority         text,
  is_decision_maker boolean not null default false,

  last_touch_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- LinkedIn URL is the only reliable person key in this dataset: under 3 percent
-- of contacts have an email address.
create unique index people_org_linkedin_uniq on people (org_id, lower(linkedin_url))
  where linkedin_url is not null;
create unique index people_org_name_company_uniq on people (org_id, lower(full_name), norm_company)
  where linkedin_url is null;

create index people_account_idx   on people (org_id, account_id) where account_id is not null;
create index people_segment_idx   on people (org_id, segment);
create index people_unmatched_idx on people (org_id, norm_company) where account_id is null;

-- A signal is a dated, sourced fact. Everything the score cites exists as a row
-- here, which is what makes "why now" auditable rather than a vibe.
create type signal_kind as enum (
  'funding_round', 'hiring_volume', 'new_role_posted', 'leadership_change',
  'warm_connection', 'existing_relationship', 'contract_award', 'news_mention',
  'engagement_reply'
);
create type signal_direction as enum ('positive', 'neutral', 'negative');

create table signals (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  person_id  uuid references people(id) on delete set null,

  kind      signal_kind not null,
  direction signal_direction not null default 'positive',
  headline  text not null,
  detail    text,
  magnitude numeric,
  -- When the thing happened, deliberately separate from when we learned it.
  occurred_at date not null,
  -- Free text rather than an enum, so a CSV import and an API sync write
  -- through the same code path. ARCHITECTURE.md section 9.
  source      text not null,
  source_ref  text,
  ingested_at timestamptz not null default now()
);

-- Re-running an importer must not duplicate signals.
create unique index signals_dedupe_uniq
  on signals (org_id, account_id, kind, occurred_at, coalesce(source_ref, ''));
create index signals_account_idx on signals (org_id, account_id, occurred_at desc);
create index signals_recent_idx  on signals (org_id, occurred_at desc) where direction = 'positive';

create type suppression_scope as enum ('client', 'competitor', 'do_not_contact', 'placed_candidate');

create table suppressions (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  scope  suppression_scope not null default 'client',
  norm_domain  text,
  norm_company text,
  reason text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint suppressions_has_key check (norm_domain is not null or norm_company is not null)
);

create unique index suppressions_domain_uniq on suppressions (org_id, norm_domain)
  where norm_domain is not null and active;
create unique index suppressions_company_uniq on suppressions (org_id, norm_company)
  where norm_company is not null and active;

-- The append-only audit log across the product. Nothing updates it.
create type activity_kind as enum (
  'tier_change', 'recommendation_resolved', 'note', 'outreach_sent',
  'reply_received', 'meeting_booked', 'action_completed', 'score_change',
  'import', 'manual_edit'
);

create table activities (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  person_id  uuid references people(id) on delete set null,
  actor_id   uuid references users(id) on delete set null,
  agent_run_id uuid references agent_runs(id) on delete set null,

  kind    activity_kind not null,
  summary text not null,
  detail  jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index activities_account_idx on activities (org_id, account_id, occurred_at desc);
create index activities_feed_idx    on activities (org_id, occurred_at desc);
