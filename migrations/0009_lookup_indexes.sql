-- Indexes for the per-account lookups the boards actually run.
--
-- The existing indexes on these tables all lead with org_id, because that is
-- how the tenancy rule is written and it is right for a list query. But the
-- market map asks a different question 25 times per page: "the roles for THIS
-- account", with no org_id in the subquery because the outer query already
-- scoped it.
--
-- Postgres cannot use an (org_id, account_id) index for a predicate that only
-- names account_id, so it fell back to a sequential scan, once per row. The
-- plan showed `Seq Scan on account_roles (loops=25)`. Small tables today, and
-- it grows linearly with every company enriched.
--
-- These lead with account_id, which is what the subqueries filter on. The
-- tenancy indexes stay: they serve the list queries.

create index account_roles_by_account on account_roles (account_id) where qualified;
create index account_targets_by_account on account_targets (account_id, rank_score desc nulls last);
create index heat_signals_by_account on heat_signals (account_id) where account_id is not null;
