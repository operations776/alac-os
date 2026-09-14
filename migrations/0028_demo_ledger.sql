-- The demo ledger: every row `npm run seed:demo -- --apply` inserted.
--
-- The operations board is live, so test data has to be removable without
-- guessing. The seed records the id of each row it created (and each row its
-- inserts made through triggers: activity, notifications, review tasks,
-- companies) here in the same transaction, and `--remove` deletes exactly
-- those rows. A row that is not in this table is real and is never touched.
--
-- Only tables keyed by a single uuid `id` are ledgered. Rows in composite key
-- tables (content_platforms, idea_votes, task_collaborators) go with their
-- parent through on delete cascade.

create table if not exists mc.demo_rows (
  table_name text        not null,
  row_id     uuid        not null,
  created_at timestamptz not null default now(),
  primary key (table_name, row_id)
);

-- --remove and the entity cleanup look rows up by id alone.
create index if not exists demo_rows_row_id_idx on mc.demo_rows (row_id);
