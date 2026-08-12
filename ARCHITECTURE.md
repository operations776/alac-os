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
| Database | Supabase Postgres | project `alac-os` |
| Auth | Supabase Auth, cookie sessions via `@supabase/ssr` | 0.7.x |
| Reasoning | OpenAI API, server only | `openai` 6.x |
| Hosting | Vercel | |
| CI | GitHub Actions: typecheck, lint, build | |

Dependencies are pinned. Test after any bump.

Known: Next 16.2.12 pulls transitive `postcss` and `sharp` advisories. `npm audit fix --force` would move us to 16.3.0 and break the pin. We stay on 16.2.12 to match the sibling Pulse app, which runs this version in production. Revisit when Pulse moves.

## 3. Tenancy

Multi-tenant from birth even though ALAC is the only tenant on day one. Retrofitting tenancy is the most expensive migration there is.

- Every tenant table carries `org_id uuid not null references orgs(id) on delete cascade`.
- RLS is enabled in the **same migration that creates the table**. A table without policies is a leak, not a todo.
- Policies never inline a membership subquery. They call `is_org_member(org_id)` or `has_org_role(org_id, role)`, both `security definer`, both defined once in the identity migration.
- Reads go through the cookie-session server client, so a missing policy shows up as empty data rather than a leak.
- The service-role key lives in exactly one module, `src/lib/server/supabase-admin.ts`, marked `server-only`. Its permitted callers are listed there. A new caller updates that list in the same commit.

## 4. The ten data laws

Carried from `pulse/PLAYBOOK.md`. These are not style preferences.

1. **Any write touching two or more tables is a Postgres function called via RPC.** supabase-js has no transactions. Sequential client-side writes are a bug even when they pass.
2. **Unique constraints are the race guards.** Insert with conflict handling. Never check-then-insert.
3. **Claim before irreversible side effects.** The `agent_runs` row exists before the first OpenAI call, never after.
4. **Delete database rows before storage blobs.**
5. **Never couple critical record creation to an optional feature.**
6. **Every async external effect gets a reconciliation sweep.** `sweep_stalled_runs` closes runs stuck in `running`.
7. **Every new env var lands in the table in section 8 and in the Vercel config in the same commit as the code that reads it.**
8. **Pin dependencies.** Test after bumps.
9. **No fallback recipients, no silent partial success.** Every batch action returns honest counts. A scoring run that fails 12 of 150 items says so.
10. **Deploy order: migrations before the code that needs them.** Apply via the Supabase MCP, mirror the identical SQL into `supabase/migrations/` in the same commit.

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
src/lib/server/ai/       openai.ts prompts pricing.ts run.ts           (server only)
src/lib/server/import/   tam.ts connections.ts match.ts
src/lib/supabase/        client.ts server.ts types.ts
src/config/              brand.ts icp.ts
scripts/                 import-tam.mjs import-connections.mjs score.mjs verify-ai.mjs
supabase/migrations/     mirrored SQL, applied via MCP first
e2e/                     Playwright specs, written here, run by Daniyal
```

Branding lives in `src/config/brand.ts` only. Never hardcode the product name anywhere else.

## 8. Environment variables

Law 7: a new row here and in the Vercel config lands in the same commit as the code that reads it.

| Var | Client exposed | Required | Purpose, and what unset does |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Supabase project URL. Unset: the app cannot boot. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Browser key. RLS is the boundary, so this is safe to ship. Unset: no reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | yes | Bypasses RLS. Only `src/lib/server/supabase-admin.ts` may read it. Used by importers and scheduled runs. |
| `NEXT_PUBLIC_SITE_URL` | yes | deployed only | Absolute origin so auth redirects land on the right host. Unset locally is fine. |
| `OPENAI_API_KEY` | no | for reasoning | RecruiterGTM's key. Server only. Unset: deterministic scores still work, the reasoning pass is disabled and the UI says so rather than inventing text. |
| `OPENAI_MODEL` | no | no | Model override. Changing it means changing `MODEL_RATES` in `src/lib/server/ai/pricing.ts` in the same commit, or `agent_runs.cost_usd` lies. |
| `ALAC_DATA_DIR` | no | importers only | Absolute path to the client workspace holding the real CSVs. Deliberately outside this public repo. |
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
