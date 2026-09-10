-- Why a candidate came off the market, and when.
--
-- `active` already existed and nothing ever set it false, so a candidate
-- could be added and never removed. Same rule as everywhere else on this
-- desk: nothing is deleted, a reason is recorded, and it can be brought
-- back. A placed candidate is the best outcome there is and losing that
-- record would be the worst way to celebrate it.
alter table candidates
  add column if not exists inactive_reason text,
  add column if not exists deactivated_at timestamptz;

create index if not exists candidates_inactive
  on candidates (org_id, deactivated_at desc)
  where not active;
