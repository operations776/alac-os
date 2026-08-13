# ALAC OS Architecture

The binding system spec. Feature code cites this file. Where this file and the code disagree, the code is wrong.

## 1. What this product is

ALAC OS is a **business development intelligence layer** for ALAC HR Solutions. It answers four questions, in this order:

1. Who are we trying to win this year and this quarter?
2. Which accounts and people matter most right now?
3. Exactly who should Adrian call, message, or follow up with today?
4. Why, for every one of those, with evidence he can check?

It exists to remove decision fatigue. The measure of success is that Adrian opens it and executes, rather than opening it and deciding.

**What it is not.** Not an ATS. Not a CRM. It does not track candidates through a pipeline, does not manage submittals or placements, does not send outreach, and does not store candidate records. SourceWhale is the system of record for execution. This boundary is a product decision and a legal one, see section 9.

## 2. Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js, app router, route groups | 16.2.12 |
| UI | React | 19.2.4 |
| Language | TypeScript | 5.9.3 |
| Styling | Tailwind via `@tailwindcss/postcss`, tokens in `globals.css` | 4.3.3 |
| Icons | lucide-react, 16px, stroke 1.5 | 1.28.0 |
| Database | Neon Postgres 17, via the Vercel Marketplace | resource `alac-os-db`, region `iad1`, free plan |
| DB driver | `@neondatabase/serverless` for queries, `pg` for migrations | 1.x / 8.x |
| Auth | Own: email and password, hashed, signed httpOnly session cookie | |
| Reasoning | OpenAI API, server only | `openai` 6.x |
| Hosting | Vercel | project `alac-os` |
| CI | GitHub Actions: typecheck, lint, build | |

Two connection strings, and the difference matters. `DATABASE_URL` is pooled through PgBouncer and is what request handlers use. `DATABASE_URL_UNPOOLED` is a direct connection and is what migrations and long-running importers use, because the pooler does not support session-level state such as advisory locks.

Dependencies are pinned. Test after any bump.

Known: Next 16.2.12 pulls transitive `postcss` and `sharp` advisories. `npm audit fix --force` would move us to 16.3.0 and break the pin. We stay on 16.2.12 to match the sibling Pulse app, which runs this version in production. Revisit when Pulse moves.

## 3. Tenancy

Multi-tenant from birth even though ALAC is the only tenant on day one. Retrofitting tenancy is the most expensive migration there is.

- Every tenant table carries `org_id uuid not null references orgs(id) on delete cascade`.
- **Enforcement lives in server code, not in database policies.** Neon is Postgres without a JWT-aware auth layer in front of it, so there is no `auth.uid()` for a policy to read. Every query therefore runs through the helpers in `src/lib/server/db.ts`, which require a session and take `org_id` as an explicit argument.
- **The rule that makes this safe: no route handler, page, or action ever builds SQL itself.** Data access is confined to `src/lib/server/queries/`, every function there takes `orgId` as its first parameter, and the value comes from the verified session, never from a request body or URL.
- `org_id` stays on every table and every index. Switching to database-level RLS later is then a policy migration and nothing else, with no schema change and no data backfill.
- The unpooled connection string is read by exactly one module, `src/lib/server/db.ts`, marked `server-only`. It never reaches a client component.

This is a deliberate trade. Database policies fail closed, which is stronger, and they were the plan while the database was Supabase. With Neon and a two to three person tenant, the honest engineering choice is one enforcement point in code that is actually correct, rather than a JWT plumbing exercise finished the night before a demo.

## 4. The ten data laws

Carried from `pulse/PLAYBOOK.md`. These are not style preferences.

1. **Any write touching two or more tables runs inside one transaction.** With Neon this is a real `BEGIN` / `COMMIT` through a `pg` client, wrapped by the `tx()` helper in `src/lib/server/db.ts`. Sequential autocommit writes are a bug even when they pass. Multi-step writes that will be called from more than one place are Postgres functions, so the transaction boundary lives with the logic rather than with the caller.
2. **Unique constraints are the race guards.** Insert with conflict handling. Never check-then-insert.
3. **Claim before irreversible side effects.** The `agent_runs` row exists before the first OpenAI call, never after.
4. **Delete database rows before storage blobs.**
5. **Never couple critical record creation to an optional feature.**
6. **Every async external effect gets a reconciliation sweep.** `sweep_stalled_runs` closes runs stuck in `running`.
7. **Every new env var lands in the table in section 8 and in the Vercel config in the same commit as the code that reads it.**
8. **Pin dependencies.** Test after bumps.
9. **No fallback recipients, no silent partial success.** Every batch action returns honest counts. A scoring run that fails 12 of 150 items says so.
10. **Deploy order: migrations before the code that needs them.** Migrations are numbered SQL files in `migrations/`, applied by `npm run migrate` over the unpooled connection, recorded in a `schema_migrations` table, and each runs inside a transaction so a failure leaves nothing half applied.
11. **Tenant scoping is a function argument, never an ambient default.** Every query function takes `orgId` first, sourced from the verified session. See section 3.

## 5. The decision engine

Two layers, deliberately separate. This is the most important design decision in the product.

**Layer 1, deterministic.** `src/lib/scoring/compute.ts`, a pure function. Five components summing to 100, then penalties:

| Component | Max | Inputs |
| --- | --- | --- |
| ICP fit | 25 | defense verdict, vertical, employee band, geography, current quarter focus |
| Hiring signal | 25 | open roles, banded not linear, plus ICP-title match in tags |
| Timing | 20 | funding recency, modified by stage |
| Relationship | 15 | first-degree contact, decision maker, connection recency |
| Revenue potential | 15 | role volume, headcount capacity, total funding |

Penalties subtract after: unactionable record, list filler, too early to pay agency fees.

Every term writes `{term, input_value, weight, points, note}` into `account_scores.breakdown`. The UI renders that as a table. It runs over all accounts in seconds, costs nothing, is reproducible, and works with no API key.

`Priority_Score` from the source CSV is **stored but not ranked on**. It is a bucket, not a score: 52 percent of the file shares one value and that value is a function of defense verdict and open-roles-present, both already scored. Ranking on it would double count and produce an arbitrary Top 25 out of thousands of ties.

**Layer 2, the LLM.** Runs on the top 150 accounts plus any account with a pending recommendation. It **never produces the score. It explains the score.** If the model disagrees with the number it says so in `risks` and `tier_opinion`, which becomes a recommendation for a human. It does not move the number.

**The grounding rule.** Every `cited_signal_ids` entry returned by the model must be an id that was supplied in that request's input. A response citing anything else is rejected and counted in `items_failed`. Enforced in code, not merely asked for in the prompt. This is what lets the decision card show "why now" beside the dated signal it came from.

**Tier proposals** rank non-suppressed accounts by score: 1-25 Top, 26-50 Next, 51-150 Watch. Differences from the current tier become `recommendations` rows, never direct writes. Two guards keep the queue trustworthy:

- **Hysteresis.** No demotion recommendation unless the account fell 8 or more points, or 10 or more rank positions, past the boundary. Without this an account hovering at rank 25 generates a recommendation every week and Adrian learns to ignore the queue.
- **`tier_locked`.** A human pin. The engine may not demote a locked account.

## 6. The operating rhythm

A real chain, each row carrying the foreign key upward:

```
targets (year) -> targets (quarter) -> weekly_focus -> daily_actions
```

That chain is what lets `/today` answer "why is this on my list" with "because it serves this quarter's thesis."

The quarter's `focus_verticals` and `focus_geographies` feed **back into scoring** as a bonus inside ICP fit. Editing the quarterly thesis re-orders the Top 25. That is what makes the cascade real rather than decorative.

`daily_actions` is capped at 10 per day. A list of 40 is a list he ignores, which reintroduces the decision fatigue this product exists to remove.

## 7. Directory map

```
src/app/(auth)/          signin, signup
src/app/(app)/           dashboard portfolio accounts people today rhythm messages engine settings
src/app/api/             score, draft, plan
src/components/          shell, portfolio, decision, recommendations, rhythm, messaging, ui
src/lib/scoring/         compute.ts weights.ts normalize.ts tiers.ts   (pure, testable, no IO)
src/lib/server/db.ts     sql(), tx(), server-only, the ONLY module reading the connection string
src/lib/server/auth.ts   password hashing, session cookie, requireSession()
src/lib/server/queries/  every data access function, each taking orgId first
src/lib/server/ai/       openai.ts prompts pricing.ts run.ts           (server only)
src/lib/server/import/   tam.ts connections.ts match.ts
src/config/              brand.ts icp.ts
migrations/              numbered SQL, applied by npm run migrate, tracked in schema_migrations
scripts/                 migrate.mjs import-tam.mjs import-connections.mjs score.mjs verify-ai.mjs
e2e/                     Playwright specs, written here, run by Daniyal
```

Branding lives in `src/config/brand.ts` only. Never hardcode the product name anywhere else.

## 8. Environment variables

Law 7: a new row here and in the Vercel config lands in the same commit as the code that reads it.

Provisioned automatically by the Neon integration and pulled with `vercel env pull`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, plus a set of `PG*` and `POSTGRES_*` aliases the app does not read.

| Var | Client exposed | Required | Purpose, and what unset does |
| --- | --- | --- | --- |
| `DATABASE_URL` | no | yes | Pooled Neon connection, used by every request handler. Unset: the app cannot boot. |
| `DATABASE_URL_UNPOOLED` | no | yes | Direct connection for migrations and importers, which need session state the pooler does not carry. |
| `SESSION_SECRET` | no | yes | Signs the session cookie. Rotating it logs everyone out, which is the intended emergency lever. Unset: auth refuses to start rather than falling back to an insecure default. |
| `NEXT_PUBLIC_SITE_URL` | yes | deployed only | Absolute origin so auth redirects land on the right host. Unset locally is fine. |
| `OPENAI_API_KEY` | no | for reasoning | RecruiterGTM's key. Server only. Unset: deterministic scores still work, the reasoning pass is disabled and the UI says so rather than inventing text. |
| `OPENAI_MODEL` | no | no | Model override. Changing it means changing `MODEL_RATES` in `src/lib/server/ai/pricing.ts` in the same commit, or `agent_runs.cost_usd` lies. |
| `ALAC_DATA_DIR` | no | importers only | Absolute path to the client workspace holding the real CSVs. Deliberately outside this public repo. |
| `ALAC_SEED_PASSWORD` | no | `create:user` only | Password for `npm run create:user`. Unset: one is generated and printed once. Never committed, never a default. |
| `SOURCEWHALE_API_KEY` | no | phase 2 | Read-oriented sync. See section 9. Unset: the CSV bridge covers the same code path. |
| `CRON_SECRET` | no | phase 2 | Shared secret for scheduled runs. |

## 9. The SourceWhale boundary

**What SourceWhale is here:** the system of record for execution, follow-ups, tasks, and relationship management. Adrian said so, and the architecture takes him at his word.

**What ALAC OS reads from it:** activity, replies, and task completion, flowing **inbound only** into `activities` and `signals`, so engagement recency feeds scoring. One direction first. We do not write execution state back until the read path has proven itself.

**The constraint, stated plainly.** SourceWhale's published API terms prohibit combining the API with "AI-related technologies" without prior written approval, and prohibit building a product that competes with their platform. ALAC OS is an intelligence layer rather than an ATS, which is the right side of the competing-product line, but the AI clause is directly engaged by what this product does.

Therefore: **Adrian requests written confirmation from his SourceWhale account executive.** It is his account and his commercial relationship, so the request is his to make, not ours. Until that confirmation exists, treat the API path as provisional.

**Why this is not a blocker.** `signals.source` and `signals.source_ref` are free text, and the CSV export/import bridge writes through the identical code path the API uses. Engagement inputs to scoring therefore work with or without API access. The product's value is never blocked on someone else's legal team.

## 10. Speed

Server response under 300ms p75. Lists virtualize past 200 rows. `/portfolio` renders at most 100 rows. `/accounts` pages server side over roughly 8,300 records and never ships the full table to the browser.
