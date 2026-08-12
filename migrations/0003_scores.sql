-- Scores and recommendations.
--
-- Scores are append only. A score is never updated, only inserted, which gives
-- week-over-week deltas for free. That delta is literally the "what changed
-- this week" question on the founder dashboard.

create table account_scores (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid not null references accounts(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete set null,

  score integer not null check (score between 0 and 100),

  -- The five components, stored separately so the UI can show why the number
  -- is what it is without re-deriving anything. They sum to 100 before
  -- penalties. ARCHITECTURE.md section 5.
  icp_fit_score           integer not null check (icp_fit_score           between 0 and 25),
  hiring_signal_score     integer not null check (hiring_signal_score     between 0 and 25),
  timing_score            integer not null check (timing_score            between 0 and 20),
  relationship_score      integer not null check (relationship_score      between 0 and 15),
  revenue_potential_score integer not null check (revenue_potential_score between 0 and 15),
  penalty                 integer not null default 0 check (penalty >= 0),

  -- Every term, its input, its weight, its contribution. This is what the
  -- "how was this calculated" table renders. Deterministic, reproducible.
  breakdown jsonb not null default '{}'::jsonb,

  -- The reasoning layer. Null on rows scored deterministically only, which is
  -- an honest state: no key means no prose, never invented prose.
  reasoning        text,
  why_now          text,
  next_best_action text,
  risks            text,
  -- Every claim must trace to signals that were supplied to the model. A
  -- response citing anything else is rejected before it reaches this table.
  cited_signal_ids uuid[] not null default '{}',
  confidence       numeric check (confidence is null or confidence between 0 and 1),
  model            text,
  prompt_version   text,
  input_tokens     integer,
  output_tokens    integer,

  scored_at timestamptz not null default now()
);

create index account_scores_latest_idx on account_scores (org_id, account_id, scored_at desc);
create index account_scores_run_idx    on account_scores (agent_run_id);

-- The newest score per account, with the one before it, so deltas are a read
-- rather than bookkeeping.
create view account_score_deltas as
select
  s.org_id,
  s.account_id,
  s.score        as current_score,
  s.scored_at,
  prev.score     as previous_score,
  s.score - prev.score as delta,
  prev.scored_at as previous_scored_at
from account_scores s
left join lateral (
  select p.score, p.scored_at
    from account_scores p
   where p.account_id = s.account_id
     and p.scored_at < s.scored_at
   order by p.scored_at desc
   limit 1
) prev on true
where s.scored_at = (
  select max(x.scored_at) from account_scores x where x.account_id = s.account_id
);

-- The human-in-the-loop object. The engine proposes, a person decides.
create type recommendation_kind as enum (
  'promote_tier', 'demote_tier', 'add_to_watch', 'remove_account',
  'reengage_contact', 'draft_outreach', 'schedule_followup'
);
create type recommendation_status as enum ('pending', 'approved', 'rejected', 'expired', 'superseded');

create table recommendations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid references accounts(id) on delete cascade,
  person_id    uuid references people(id) on delete set null,
  agent_run_id uuid references agent_runs(id) on delete set null,
  score_id     uuid references account_scores(id) on delete set null,

  kind   recommendation_kind not null,
  status recommendation_status not null default 'pending',

  from_tier portfolio_tier,
  to_tier   portfolio_tier,

  headline  text not null,
  rationale text not null,
  evidence  jsonb not null default '[]'::jsonb,
  confidence numeric check (confidence is null or confidence between 0 and 1),

  resolved_at   timestamptz,
  resolved_by   uuid references users(id) on delete set null,
  -- The operator's own words on a rejection. Phase 3 feeds these back as
  -- few-shot examples so the engine learns his judgement.
  decision_note text,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),

  constraint rec_resolution_complete check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  ),
  constraint rec_tier_change_has_tiers check (
    kind not in ('promote_tier', 'demote_tier')
    or (from_tier is not null and to_tier is not null)
  )
);

-- One live recommendation of a given kind per account, so repeated scoring
-- runs cannot flood the queue with duplicates. Data law 2.
create unique index recommendations_one_pending_uniq
  on recommendations (org_id, account_id, kind) where status = 'pending';
create index recommendations_queue_idx
  on recommendations (org_id, status, confidence desc nulls last) where status = 'pending';
