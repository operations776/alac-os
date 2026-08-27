-- Live job postings from PredictLeads.
--
-- The existing source check allowed only fiber, apify and manual. Fiber is
-- gone as a source and predictleads is now the live feed, so the constraint is
-- replaced rather than extended: leaving 'fiber' legal would let a dead code
-- path write rows nothing maintains.

alter table account_roles drop constraint if exists account_roles_source_check;
alter table account_roles
  add constraint account_roles_source_check
  check (source in ('predictleads', 'apify', 'manual', 'fiber'));

-- What the posting itself says. Salary and seniority come straight from the
-- employer's board, so they are quotable to a candidate without a second look.
alter table account_roles
  add column if not exists salary_text text,
  add column if not exists occupation  text,
  add column if not exists contract    text,
  add column if not exists first_seen  date,
  add column if not exists last_seen   date;

-- "What can I call about today" is the question the desk asks every morning,
-- and it is a scan over first_seen within a band. Without this it is a
-- sequential scan over every role on every account.
create index if not exists account_roles_fresh
  on account_roles (org_id, first_seen desc nulls last)
  where qualified;
