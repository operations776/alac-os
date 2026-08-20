# Tickets

Status updated in the same commit that finishes the ticket. Commit messages start with the ticket ID.

Status values: `todo`, `doing`, `done`, `cut`.

Reconciled against the tree on 18 Aug. Where a ticket was written before a decision changed (Supabase to Neon, RLS to server-side scoping), the ticket text now says what was actually built.

## Day 0, 6 Aug: foundation

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-1 | Scaffold Next 16 / React 19 / TS / Tailwind 4, pin deps, public repo | done |
| ALAC-2 | ARCHITECTURE.md: stack, tenancy, ten laws, engine, env table, SourceWhale boundary | done |
| ALAC-3 | DESIGN.md: palette on #14137b, type scale, depth, the contract | done |
| ALAC-4 | AI.md: calls, grounding rule, run lifecycle, model rates | done |
| ALAC-5 | CLAUDE.md, AGENTS.md, README, .env.example, .gitignore, CI | done |
| ALAC-6 | Neon Postgres project, `db.ts` pooled/unpooled split, `tx()` helper. Supabase dropped, Neon chosen | done |

## Day 1, 7 Aug: schema and data in

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-7 | Identity migration `0001`: orgs, users, org_memberships, sessions, pg_trgm. Tenancy enforced in server code, RLS deliberately not used | done |
| ALAC-8 | agent_runs table, claim-before-side-effects lifecycle used by every script | done |
| ALAC-9 | accounts table, trigram index on norm_name, org-leading indexes | done |
| ALAC-10 | people, signals, suppressions, activities | done |
| ALAC-11 | Normalizers normDomain/normCompany in `import/normalize.mjs` | done |
| ALAC-11a | Unit test the normalizers against 50 synthetic rows. No test file exists yet | todo |
| ALAC-12 | import-tam.mjs, quote-aware parser, fails under 8,000 records | done |
| ALAC-13 | Dream-client seed and pin: seed-priority-accounts.mjs | done |
| ALAC-14 | import-connections.mjs + unmatched report | done |
| ALAC-15 | Auth: signin, session cookie, layout guard, getOrgId from session, create-user script | done |

## Day 2, 8 Aug: the engine

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-16 | account_scores migration `0003`, append only, recommendations table | done |
| ALAC-17 | Deterministic scorer `scoring/compute.mjs`, five components, breakdown jsonb | done |
| ALAC-18 | Bulk scoring run over every account, wrapped in an agent_run | done |
| ALAC-19 | OpenAI client, pricing.ts, verify:ai script | done |
| ALAC-20 | Reasoning pass, forced schema, cited-id grounding check | done |
| ALAC-21 | recommendations migration, resolve and set-tier paths | done |
| ALAC-22 | Tier proposals with hysteresis and tier_locked respect | done |

## Day 3, 9 Aug: shell and portfolio

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-23 | App shell: rail, top bar, page header | done |
| ALAC-24 | UI primitives: Card, Button, Badge, Stat, Th, EmptyState, NoticeLine, score readouts. Dialog, Drawer, Toast and Skeleton deferred, no screen needs them yet | done |
| ALAC-25 | /portfolio: four tier columns with account cards | done |
| ALAC-26 | /accounts: searchable, server-paginated table, 50 per page | done |
| ALAC-27 | Manual tier change and pinning. tier_locked is read and displayed, never written from the UI | todo |

## Day 4, 10 Aug: decision card and review

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-28 | /accounts/[id] decision card: why now, evidence, breakdown, people | done |
| ALAC-29 | /portfolio/review: recommendation queue, approve, reject, reject with note | done |
| ALAC-30 | activities table exists. No feed on the account page yet | todo |
| ALAC-31 | /engine runs list exists. /engine/[runId] per-item outcomes not built | todo |

## Day 5, 11 Aug: rhythm and dashboard

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-32 | targets, weekly_focus, daily_actions migration | todo |
| ALAC-33 | /rhythm: year to quarter to week cascade, seeded quarter | todo |
| ALAC-34 | Quarter focus feeding back into the ICP fit bonus | todo |
| ALAC-35 | Weekly review run: score, reason, recommend, publish weekly_focus | todo |
| ALAC-36 | /today: ranked actions capped at 10, tick, skip, snooze | todo |
| ALAC-37 | /dashboard: the five questions, quarter strip, review status | done |

## Day 6, 12 Aug: messaging, deploy, rehearsal

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-38 | message_drafts migration + save_message_draft | todo |
| ALAC-39 | Draft generation with the full preparation trace | todo |
| ALAC-40 | /messages/[id]: reasoning trace beside the draft | todo |
| ALAC-41 | /people list exists. /people/[id] not built | todo |
| ALAC-42 | SourceWhale read sync + CSV bridge through the same code path | todo |
| ALAC-43 | Playwright specs for portfolio-review, decision-card, dashboard. Dep installed, no config and no specs yet. Daniyal runs them | todo |
| ALAC-44 | Deploy to Vercel, env vars configured, migrations verified ahead of code | todo |
| ALAC-45 | Dress rehearsal: the full demo story on the deployed URL | todo |

## Design

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-46 | Dark instrument-panel redesign built around the score ladder: DESIGN.md rewritten, globals.css token layer, primitives and every screen restyled | done |
| ALAC-47 | Material Design 3 retheme, seeded #6750A4. Light tonal surfaces, Roboto, pill controls, filled text fields, MD3 state layers and motion. Replaces the dark terminal theme end to end: DESIGN.md rewritten, single `--md-*` token set, TickScale retired for Meter, every screen restyled | done |

## Command center, 19 Aug

The workbook Adrian and Darwin actually run the desk from replaces the portfolio model. Priority and Final Score become read only source data, Top 25 and Next 25 become derived rankings, and the computed score moves to signal heat.

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-48 | Dependency free xlsx reader with the self closing cell fix, plus `test:unit` | done |
| ALAC-49 | Migration 0004: drop the portfolio model, add tam_accounts, heat_signals, performance_weeks. Repoint people | done |
| ALAC-50 | `import:desk`: batched upserts, prune to mirror the workbook, honest counts, people rematch | done |
| ALAC-51 | Desk query layer, tenant scoped, with the ranking rule in one place | done |
| ALAC-52 | /command: next week against the 10 target, signal heat, Top 25 and Next 25, performance snapshot | done |
| ALAC-53 | /queue and /queue/[id]: filters, and the READY FOR QC checklist evaluated per account | done |
| ALAC-54 | /signals: the six component heat breakdown against the TAM score | done |
| ALAC-55 | /performance: period rollup, conversion rates, Thursday review | done |
| ALAC-56 | Migration runner checksums normalized content, so CRLF does not break every applied migration on Windows | done |
| ALAC-57 | Write back: the action columns are read only in the app today. The desk still edits them in the workbook | todo |
| ALAC-58 | Compute heat from raw inputs rather than importing the six components already scored | done |

## Signal pipeline, 20 Aug

Replacing the hand curated signal log with a real one. The order matters: the
scorer defines the input contract, so it is built and tested first and the
fetchers are written to fill it.

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-62 | Deterministic heat scorer: six components, terms, honest nulls, coverage. 14 checks | done |
| ALAC-63 | Fiber AI client and `verify:fiber`, free endpoints only, key never logged | done |
| ALAC-64 | Confirm the key and read the tracker rule catalogue. 25 company rules, 27 person | done |
| ALAC-65 | `signals:setup`: tracker list, 11 rules, plan mode by default. Scoped to the 960 working accounts, not the P3 long tail | done |
| ALAC-66 | `signals:pull`: poll, parse, match, score, upsert. Validated end to end on 55 dummy signals | done |
| ALAC-67 | Job postings for signalled accounts only, count before searching, to feed hiring urgency and talent scarcity | todo |
| ALAC-68 | Exa pass: narrative and a citable source URL per signal | todo |
| ALAC-69 | OpenAI pass: `recommended_move`, grounded, cites the stored source or is rejected | todo |
| ALAC-70 | Show coverage and gaps on the signal card, so a partially scored signal says so | todo |
| ALAC-71 | Schedule the pull, and reconcile against the workbook log until the desk trusts it | todo |
| ALAC-59 | Surface the duplicate company in the source workbook (one company under two Record IDs) as a data quality panel | todo |
| ALAC-60 | Full SourceWhale ingestion once the export schema is confirmed, replacing the provisional counters | todo |

## Phase 2, after 13 Aug

Live signal ingestion from funding and job-board sources. Instantly, HeyReach, and Recruiterflow write-back. Scheduled cron re-scoring. Multi-user roles and invitations. Sequences and send tracking. Feedback loop: rejection notes and manual overrides fed back as few-shot examples so the engine learns the operator's judgement.
