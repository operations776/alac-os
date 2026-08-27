-- Every change of band, recorded when the market is re-ranked.
--
-- The bands are recomputed on every refresh, which is right, and it also
-- means the previous state is gone the moment the update runs. This is the
-- memory: who came up, who went down, and why, so the desk can answer "what
-- moved this week" and a company page can say "was Up next until Thursday".
-- Progress itself (notes, marks, messages) is keyed on the company and never
-- touched by a move.
create table band_moves (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  account_id uuid not null references tam_accounts(id) on delete cascade,
  from_band  text,
  to_band    text not null,
  reason     text,
  moved_at   timestamptz not null default now()
);
create index band_moves_recent on band_moves (org_id, moved_at desc);
create index band_moves_account on band_moves (org_id, account_id, moved_at desc);
