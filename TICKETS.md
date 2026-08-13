# Tickets

Status updated in the same commit that finishes the ticket. Commit messages start with the ticket ID.

Status values: `todo`, `doing`, `done`, `cut`.

## Day 0, 6 Aug: foundation

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-1 | Scaffold Next 16 / React 19 / TS / Tailwind 4, pin deps, public repo | done |
| ALAC-2 | ARCHITECTURE.md: stack, tenancy, ten laws, engine, env table, SourceWhale boundary | done |
| ALAC-3 | DESIGN.md: palette on #14137b, type scale, depth, the contract | done |
| ALAC-4 | AI.md: calls, grounding rule, run lifecycle, model rates | done |
| ALAC-5 | CLAUDE.md, AGENTS.md, README, .env.example, .gitignore, CI | done |
| ALAC-6 | Supabase project, client/server/types wiring | todo |

## Day 1, 7 Aug: schema and data in

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-7 | Identity migration: orgs, memberships, is_org_member, has_org_role, bootstrap_org, RLS | todo |
| ALAC-8 | agent_runs + open/close/sweep RPCs | todo |
| ALAC-9 | accounts table, pg_trgm, indexes, RLS | todo |
| ALAC-10 | people, signals, suppressions, RLS | todo |
| ALAC-11 | Normalizers normDomain/normCompany, unit tested against 50 real rows | todo |
| ALAC-12 | import_accounts_batch RPC + import-tam.mjs, quote-aware, fails under 8,000 records | todo |
| ALAC-13 | Dream-client seed and pin. Required: Anduril ranks P6 with 0 roles, Saronic and Helsing absent from the export | todo |
| ALAC-14 | import_people_batch RPC + import-connections.mjs + unmatched report | todo |
| ALAC-15 | Auth: signin, signup, middleware, requireSession, first signup calls bootstrap_org | todo |

## Day 2, 8 Aug: the engine

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-16 | account_scores migration, account_score_deltas view, record_score RPC | todo |
| ALAC-17 | Deterministic scorer: compute.ts, weights.ts, breakdown jsonb | todo |
| ALAC-18 | Bulk scoring run over every account, wrapped in an agent_run | todo |
| ALAC-19 | OpenAI client, pricing.ts, verify:ai script | done |
| ALAC-20 | Reasoning pass, forced schema, cited-id grounding check, attach_reasoning RPC | done |
| ALAC-21 | recommendations migration + resolve_recommendation and set_account_tier RPCs | done |
| ALAC-22 | Tier proposals with hysteresis and tier_locked respect | done |

## Day 3, 9 Aug: shell and portfolio

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-23 | App shell: rail, top bar, page header | todo |
| ALAC-24 | UI primitives: Button, Input, Badge, Table, Dialog, Drawer, Toast, EmptyState, Skeleton | todo |
| ALAC-25 | /portfolio: four tier columns with account cards | todo |
| ALAC-26 | /accounts: searchable, server-paginated table | todo |
| ALAC-27 | Manual tier change and pinning via set_account_tier | todo |

## Day 4, 10 Aug: decision card and review

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-28 | /accounts/[id] decision card: why now, evidence, breakdown, timeline, people | todo |
| ALAC-29 | /portfolio/review: recommendation queue, approve, reject, reject with note | done |
| ALAC-30 | activities table + feed on the account | todo |
| ALAC-31 | /engine and /engine/[runId]: runs, params, cost, per-item outcomes | todo |

## Day 5, 11 Aug: rhythm and dashboard

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-32 | targets, weekly_focus, daily_actions migration + RPCs | todo |
| ALAC-33 | /rhythm: year to quarter to week cascade, seeded quarter | todo |
| ALAC-34 | Quarter focus feeding back into the ICP fit bonus | todo |
| ALAC-35 | Weekly review run: score, reason, recommend, publish weekly_focus | todo |
| ALAC-36 | /today: ranked actions capped at 10, tick, skip, snooze | todo |
| ALAC-37 | /dashboard: the five questions, quarter strip, review status | todo |

## Day 6, 12 Aug: messaging, deploy, rehearsal

| ID | Ticket | Status |
| --- | --- | --- |
| ALAC-38 | message_drafts migration + save_message_draft RPC | todo |
| ALAC-39 | Draft generation with the full preparation trace | todo |
| ALAC-40 | /messages/[id]: reasoning trace beside the draft | todo |
| ALAC-41 | /people and /people/[id] | todo |
| ALAC-42 | SourceWhale read sync + CSV bridge through the same code path | todo |
| ALAC-43 | Playwright specs written for portfolio-review, decision-card, dashboard. Daniyal runs them | todo |
| ALAC-44 | Deploy to Vercel, env vars configured, migrations verified ahead of code | todo |
| ALAC-45 | Dress rehearsal: the full demo story on the deployed URL | todo |

## Phase 2, after 13 Aug

Live signal ingestion from funding and job-board sources. Instantly, HeyReach, and Recruiterflow write-back. Scheduled cron re-scoring. Multi-user roles and invitations. Sequences and send tracking. Feedback loop: rejection notes and manual overrides fed back as few-shot examples so the engine learns the operator's judgement.
