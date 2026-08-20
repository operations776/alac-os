-- Hand kept performance numbers.
--
-- SourceWhale ingestion is not built, so the counters on the performance screen
-- are all zero and stay zero. Adrian tracks these anyway, in his head or on
-- paper, so the screen should let him keep them here instead.
--
-- A separate table rather than editing performance_weeks, because the two have
-- different authority. performance_weeks is a mirror of the workbook and is
-- overwritten on every import; anything typed into it would be silently lost
-- the next time the workbook is loaded. These are the operator's own numbers
-- and nothing overwrites them.
--
-- When SourceWhale ingestion lands, the screen shows both and the difference
-- between them is itself informative.
create table manual_metrics (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- The week this belongs to, always a Monday, so a click always lands in
  -- exactly one bucket.
  week_starting date not null,
  metric        text not null check (metric in (
    'bd_calls', 'client_conversations', 'discoveries',
    'qualified_opps', 'commercial_asks', 'searches_won', 'placements'
  )),

  -- Never below zero. A negative call count is a mis-click, not a fact, and
  -- the constraint means the UI does not have to be the only thing stopping it.
  value integer not null default 0 check (value >= 0),

  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,

  constraint manual_metrics_uniq unique (org_id, week_starting, metric)
);

create index manual_metrics_week_idx on manual_metrics (org_id, week_starting desc);
