-- Candidates, the supply side. Section 19 of the brief.
--
-- Deliberately thin: this is the demo-able slice of the MPC engine, which is
-- Analyze Candidate plus Demand Radar. Tiers, the ten-point control gate and
-- market inventory are the next phase and would be columns on this table
-- rather than a different one.
create table candidates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,

  full_name  text not null,
  title      text,
  company    text,
  location   text,
  linkedin_url text,

  -- What they can do, in their own words or ours. Both feed the matcher.
  summary    text,
  -- The domains and customers that make them credible: UAS, Navy, GNC.
  domains    text,
  -- Where they will work. Free text, matched loosely against role location.
  geography  text,
  clearance  text,
  comp_target text,

  -- Marketability, out of 100, separate from candidate quality. Section 19.1.
  mpc_score  integer check (mpc_score between 0 and 100),
  active     boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_org on candidates (org_id, active, created_at desc);

-- Roles that have been raised with a client for a given candidate, so the
-- radar can show what has already been pitched and what has not.
create table candidate_pitches (
  org_id       uuid not null references orgs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  role_id      uuid not null references account_roles(id) on delete cascade,
  pitched_at   timestamptz not null default now(),
  primary key (org_id, candidate_id, role_id)
);
