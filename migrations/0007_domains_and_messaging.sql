-- The real company domain, and the outreach sequence.
--
-- Two additions, both fixing something the pilot exposed.
--
-- 1. domain. The pilot guessed it from the LinkedIn slug, "astranis" becoming
--    "astranis.com". That is usually right and silently wrong the rest of the
--    time, and silently wrong here means another company's staff on Adrian's
--    target list looking exactly as authoritative as the real ones. Prospeo
--    resolves it properly from the LinkedIn URL, so the resolved value is
--    stored and the guess is retired.
--
-- 2. account_messages. A drafted opener and its follow ups, per account.
--    Stored rather than generated on view because a draft that changes every
--    time the page loads cannot be reviewed, approved, or held to what it said
--    yesterday.

alter table tam_accounts
  add column domain text,
  -- Where the domain came from. A resolved domain is a fact; a guessed one is
  -- an assumption, and the two must never look the same on screen.
  add column domain_source text check (domain_source in ('prospeo', 'manual', 'guessed')),
  add column employee_count integer,
  add column enriched_at timestamptz;

create index tam_accounts_domain_idx on tam_accounts (org_id, domain) where domain is not null;

-- The outreach sequence: one opener plus follow ups, in order.
--
-- step 1 is the first touch, 2 and 3 the follow ups. They are drafts and
-- nothing here sends them: the desk's rule is that outbound is drafted and a
-- human presses send, and this table holds no send state on purpose.
create table account_messages (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  account_id uuid not null references tam_accounts(id) on delete cascade,
  -- Who it is addressed to. Null means the sequence is written for the account
  -- rather than a named person, which happens when nobody has been sourced yet.
  target_id  uuid references account_targets(id) on delete set null,

  step    integer not null check (step between 1 and 5),
  channel text not null default 'linkedin' check (channel in ('linkedin', 'email')),

  subject text,
  body    text not null,

  -- What the draft leaned on. Kept so a reviewer can check the claim rather
  -- than trust it: every fact in the body should be traceable to one of these.
  grounded_on jsonb not null default '[]'::jsonb,

  model      text,
  drafted_at timestamptz not null default now(),

  -- Adrian's decision. Nothing is sent from this app, so this records review,
  -- not delivery.
  approved   boolean not null default false,

  constraint account_messages_uniq unique (org_id, account_id, step, channel)
);

create index account_messages_account_idx on account_messages (org_id, account_id, step);

-- Why this account is on the board, in one line, and which band it sits in.
-- Denormalized onto the account because the Targets screen ranks thousands of
-- rows and recomputing the reason per row per render is the difference between
-- a fast page and a slow one.
alter table tam_accounts
  add column work_band text check (work_band in ('now', 'next', 'backlog')),
  add column work_reason text,
  add column work_score integer,
  add column banded_at timestamptz;

create index tam_accounts_band_idx on tam_accounts (org_id, work_band, work_score desc nulls last);
