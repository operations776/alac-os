-- Difficulty on its own, beside the commercial score.
--
-- relevance is difficulty x time open, which is right for "what is worth
-- calling about this month" and wrong for "what went up this week": a role
-- posted on Monday cannot have aged, so under that score nothing new ever
-- clears the bar and five live leads a day is always empty. The daily leads
-- gate on how hard the role is to fill, and age breaks ties.
alter table account_roles add column if not exists difficulty integer;
create index if not exists account_roles_fresh_hard
  on account_roles (org_id, first_seen desc, difficulty desc)
  where qualified and closed_at is null;
