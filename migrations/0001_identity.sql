-- Identity and tenancy.
--
-- Tenancy is enforced in server code rather than in RLS policies: Neon has no
-- JWT aware auth layer for a policy to read, so there is no auth.uid(). Every
-- query function takes org_id explicitly, sourced from the verified session.
-- org_id stays on every table and index so switching to database level RLS
-- later is a policy migration and nothing else. ARCHITECTURE.md section 3.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  -- scrypt, salted per user. Null means the account exists but cannot sign in
  -- yet, which is how an invited user waits for their first password.
  password_hash text,
  full_name     text not null default '',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- Email is the login identifier, so uniqueness is case insensitive. A unique
-- index is the race guard: two simultaneous signups collide here rather than
-- producing two accounts. Data law 2.
create unique index users_email_uniq on users (lower(email));

create type org_role as enum ('owner', 'admin', 'member');

create table org_memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_memberships_user_idx on org_memberships (user_id);

-- Sessions live in the database rather than only in a signed cookie, so that
-- sign out is real and a stolen cookie can be revoked. The cookie carries the
-- id and a signature; the row is the authority.
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_used_at timestamptz not null default now(),
  user_agent   text
);

create index sessions_user_idx on sessions (user_id);
-- Expired session cleanup scans this.
create index sessions_expiry_idx on sessions (expires_at);

-- Every AI action belongs to a run. The row is created before the first paid
-- call, never after, so a crash still leaves evidence that money was spent.
-- Data law 3, and the reconciliation sweep in data law 6 reads status.
create type agent_run_kind as enum (
  'import', 'score_deterministic', 'score_reasoning', 'recommend',
  'weekly_review', 'daily_plan', 'draft_message'
);
create type agent_run_status as enum ('running', 'complete', 'failed', 'partial');

create table agent_runs (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  kind    agent_run_kind not null,
  status  agent_run_status not null default 'running',
  trigger text not null default 'manual' check (trigger in ('manual', 'cron', 'api')),
  triggered_by uuid references users(id) on delete set null,

  params         jsonb not null default '{}'::jsonb,
  model          text,
  prompt_version text,

  items_total  integer not null default 0 check (items_total  >= 0),
  items_ok     integer not null default 0 check (items_ok     >= 0),
  items_failed integer not null default 0 check (items_failed >= 0),

  input_tokens  integer not null default 0 check (input_tokens  >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd      numeric(10, 4) not null default 0 check (cost_usd >= 0),

  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error       text,
  log         jsonb not null default '[]'::jsonb,

  -- A finished run has an end time, an unfinished one does not. This is the
  -- constraint that keeps the sweep honest.
  constraint agent_runs_finish_consistent check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create index agent_runs_recent_idx  on agent_runs (org_id, started_at desc);
-- The stalled run sweep reads exactly this.
create index agent_runs_running_idx on agent_runs (org_id, started_at) where status = 'running';
