-- The LinkedIn numeric organisation id.
--
-- LinkedIn's job search filters by `f_C=<org id>`, and this app holds slugs,
-- not ids. Without the id the only way to find a company's postings is to
-- search its NAME, which returns competitors alongside it: a keyword search
-- for "Astranis" came back with SpaceX, Antares and Array Labs mixed in, and
-- those roles would have been quietly attributed to the wrong account.
--
-- Resolved once per company and stored, because it never changes and resolving
-- it is the expensive half of the job pull.
alter table tam_accounts
  add column linkedin_org_id text;

create index tam_accounts_org_id_idx on tam_accounts (org_id, linkedin_org_id)
  where linkedin_org_id is not null;

-- Where a role came from. Fiber and Apify return the same kind of row through
-- different pipes, and when one of them starts returning nonsense the first
-- question is which one.
alter table account_roles
  add column source text not null default 'fiber' check (source in ('fiber', 'apify', 'manual')),
  add column applicants integer;
