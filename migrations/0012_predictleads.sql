-- PredictLeads replaces Fiber as the signal source.
--
-- Fiber was never switched on: its tracker list was never created, so every
-- signal in this database arrived from the workbook by hand. PredictLeads
-- answers about a company immediately rather than watching for a change, which
-- is why the desk can have signals today instead of after a watch period.
--
-- The enum is extended rather than replaced. 'fiber' stays a legal value so
-- the migration cannot orphan a historic row, and nothing is rewritten.

alter type signal_source add value if not exists 'predictleads';

-- Structured fields, kept as columns rather than buried in the summary text.
-- The scorer reads these, and a number stored as prose cannot be compared.
alter table heat_signals
  add column if not exists category      text,
  add column if not exists confidence    numeric(5,4),
  add column if not exists amount_usd    numeric(16,2),
  add column if not exists headcount     integer,
  add column if not exists person_name   text,
  add column if not exists person_title  text,
  add column if not exists location_text text;

-- One row per provider event. The provider id is the natural key: pulling the
-- same company twice must update rather than duplicate, and a check then insert
-- would race against a concurrent pull.
alter table heat_signals
  add column if not exists external_id text;

create unique index if not exists heat_signals_provider_event
  on heat_signals (org_id, external_id)
  where external_id is not null;

-- The band filter for the pull. Signals are only worth credits on the accounts
-- actually being worked, so the puller reads this index rather than scanning
-- 3,045 rows to find 50.
create index if not exists tam_accounts_band_domain
  on tam_accounts (org_id, work_band, domain)
  where domain is not null;
