-- Dismiss and restore, for anything the desk puts on a screen.
--
-- His point on 10 September: he can score a signal and a posting but cannot
-- say "not this one". A screen that only the scorer can edit is a screen he
-- has to argue with rather than operate.
--
-- One table for every kind of thing, because the rule is the same for all of
-- them: nothing is deleted, a reason is recorded, and it can be brought back.
-- A signal dismissed today is still in the log tomorrow with its arithmetic
-- intact; it is simply no longer on his board.
create table dismissals (
  org_id     uuid not null references orgs(id) on delete cascade,
  kind       text not null check (kind in ('signal', 'role')),
  -- The row this refers to. Not a foreign key on purpose: a re-pull can
  -- replace a role row, and a dismissal that vanished with it would ask him
  -- the same question twice. The id is stable across a re-pull because the
  -- upsert conflicts on the provider's own id.
  ref_id     uuid not null,
  reason     text,
  note       text,
  dismissed_at timestamptz not null default now(),
  primary key (org_id, kind, ref_id)
);

create index dismissals_recent on dismissals (org_id, kind, dismissed_at desc);
