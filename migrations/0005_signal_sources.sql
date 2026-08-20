-- Signal provenance.
--
-- Until now every heat signal came from the workbook, hand curated and hand
-- scored. Once Fiber starts producing them the desk needs to know, for any
-- given row, where it came from and whether the score was computed or copied.
-- Without that a wrong automated signal is indistinguishable from a considered
-- human one, and the whole board stops being trustworthy.
--
-- The workbook remains the source of truth for the rows it already owns. The
-- importer and the puller write to different sources and never overwrite each
-- other, which is what lets both run until the desk decides it trusts the feed.

create type signal_source as enum ('workbook', 'fiber', 'manual');

alter table heat_signals
  add column source signal_source not null default 'workbook',
  -- Fiber's own event id. Their docs say to dedupe on it, so it is stored and
  -- uniquely constrained rather than only folded into signal_key.
  add column source_event_id text,
  add column rule_type text,
  -- The raw payload as received. Kept because a parser change later has to be
  -- re-runnable against what actually arrived, not against what the parser
  -- happened to understand at the time.
  add column raw jsonb,
  -- The scorer's own output: the terms behind each component, what could not
  -- be assessed, and how much of the model was covered. Contract rule 11.
  add column breakdown jsonb,
  add column coverage integer check (coverage between 0 and 100),
  add column scored_at timestamptz;

-- One row per Fiber event. A partial index rather than a plain unique
-- constraint: workbook rows have no event id and must not collide on null.
create unique index heat_signals_event_uniq
  on heat_signals (org_id, source_event_id)
  where source_event_id is not null;

create index heat_signals_source_idx on heat_signals (org_id, source, signal_date desc nulls last);

-- The tracker lists this app owns at Fiber, so a re-run finds its own list
-- instead of creating a second one every time it is invoked.
create table signal_watchlists (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  provider    text not null default 'fiber',
  external_id text not null,
  name        text not null,
  entity_type text not null default 'company' check (entity_type in ('company', 'person')),

  -- What this list watches for, as sent to the provider. Stored so a rule
  -- change is visible here rather than only in someone else's dashboard.
  rules jsonb not null default '[]'::jsonb,

  entity_count  integer not null default 0,
  last_pulled_at timestamptz,
  -- The high water mark for incremental pulls. Fiber's signals endpoint takes
  -- `since`, so this is what makes a pull cheap and repeatable.
  last_signal_at timestamptz,

  created_at timestamptz not null default now(),

  constraint signal_watchlists_uniq unique (org_id, provider, external_id)
);

create index signal_watchlists_org_idx on signal_watchlists (org_id, provider);
