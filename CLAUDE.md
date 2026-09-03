@AGENTS.md

# ALAC OS

The ALAC desk command center. It is the application form of the operating workbook Adrian and Darwin run the desk from: one company one row in the account queue, a signal heat board for what just changed, ranked Top 25 and Next 25 bands, and the SourceWhale performance review.

The workbook's INSTRUCTIONS tab is the specification. When this app and that tab disagree, the tab wins and this app is wrong.

Detail lives in `ARCHITECTURE.md` (system), `DESIGN.md` (UI contract), and `AI.md` (every model call and what it costs). This file is the operating manual only. Keep it small, it is paid for in every session.

## The model, in one paragraph

`tam_accounts` is the account queue, keyed on Record ID. `heat_signals` is the signal log, six components out of 100 plus the delta against the account's TAM score. `performance_weeks` is one row per SourceWhale week, carrying the counters and the Thursday choke point analysis. Work now and Up next are the `work_band` written by `map-market` on every refresh, from fit, what changed, who you know and what went up this week. The `account_desk` view carries every input the next move needs, and `nextMove()` in `src/lib/scoring/next-move.mjs` turns them into one instruction per company, derived on read. The performance snapshot is a rollup. `people` is the warm network, matched to accounts by normalized company name and independent of the TAM.

## Workflow

1. Pick a ticket from `TICKETS.md`. One ticket, small commits.
2. Every commit message starts with the ticket ID: `ALAC-12: import TAM accounts`.
3. Before pushing: `npm run typecheck`, `npm run lint`, `npm run build`. The production build is the gate, not dev.
4. Update `TICKETS.md` status in the same commit that finishes the ticket.
5. Commits are authored as `operations776`. No `Co-Authored-By` trailers, Vercel rejects foreign commit authors on this account.

## Hard rules

- **Transaction rule.** Any write touching two or more tables runs inside one transaction, via the `tx()` helper. Sequential autocommit writes are a bug even when they pass.
- **Tenant scoping is an argument.** Every function in `src/lib/server/queries/` takes `orgId` first, and it comes from the verified session, never from a request body or URL. Route handlers and pages never build SQL themselves.
- **Only `src/lib/server/db.ts` reads a connection string.** It is `server-only`. Nothing else touches `DATABASE_URL`.
- **Migrations first.** Numbered SQL in `migrations/`, applied with `npm run migrate` over the unpooled URL, before the code that reads them.
- **Race guards are unique constraints.** Insert with conflict handling. Never check-then-insert.
- **Claim before side effects.** The `agent_runs` row exists before the first OpenAI call, never after.
- **Never fabricate.** A reasoning pass that cites a signal id it was not given is rejected and counted as failed. No API key means the reasoning panel says so, it does not invent prose.
- **Rates live in `pricing.ts` only.** Changing `OPENAI_MODEL` means changing `MODEL_RATES` in the same commit, or the cost meter lies.
- **Env var rule.** A new env var lands in the `ARCHITECTURE.md` table AND the Vercel config in the same commit as the code that reads it.
- **Two scores, and only one of them is ours.** `tam_accounts.priority` and `final_score` are source data finalized in the Master TAM: never computed, never written by the app, never manually promoted. The heat score is the computed one, six components out of 100, and its breakdown is always shown next to the total.
- **Client data never enters this repo.** It is public. No real company names, contact names, emails, or the suppression list in any committed file, fixture, or test. Importers read from `ALAC_DATA_DIR`.
- **Branding lives in `src/config/brand.ts` only.**
- **No em dashes** in code, copy, comments, or commit messages. Commas, colons, periods.
- **No emoji in UI.** Icons are Lucide, 16px, stroke 1.5.
- **Pin dependencies.** Test after any bump.

## Known bug classes, do not reintroduce

- **revalidatePath inside an open dialog.** Revalidating while a dialog or drawer is open remounts the tree under it and drops the user's input. Close the layer first, or use `router.refresh()` scoped to the list.
- **Silent partial success.** Batch actions return honest counts. A run that failed 12 of 150 says 138 ok, 12 failed.
- **Check-then-insert.** Use a unique index and handle the conflict.
- **Line-splitting a CSV.** The TAM file has embedded newlines inside quoted description fields. A naive split reports 10,908 rows for a file that holds 8,298. Always use the quote-aware parser in `src/lib/server/import/`.
- **Regex-parsing an xlsx cell.** A cell has two forms, `<c r="K5" s="38"/>` and `<c r="M5" t="s"><v>501</v></c>`. A naive `/<c([^>]*)>([\s\S]*?)<\/c>/` lets the empty self closing cell swallow the next one: the value lands under the wrong column letter and its shared string is never resolved, so a status arrives as the integer 501. Every row still parses, so the corruption is silent. Use `openWorkbook` in `src/lib/server/import/xlsx.mjs`, and keep `npm run test:unit` green.
- **One statement per row against a remote database.** 3,045 accounts as 3,045 round trips is an import that runs for minutes. Batch with `insertChunked`, which bounds the chunk against the 65535 parameter ceiling.
- **An import that only adds.** The workbook is the source of truth, so the import mirrors it: it prunes anything it did not see this run. Without that, a company dropped from the queue lives on, and a change to a row's key leaves the old row behind as a duplicate company.
- **Writing a payload parser from the docs alone.** PredictLeads returns `posted_at` as null on every job and dates events by `effective_date` with `found_at` as the fallback. The client was written against live responses, not the examples. Read the live payload before trusting an example.
- **A regex through a shell heredoc.** `\b` became a literal backspace and `qualifyRole` rejected all 4,122 titles without throwing. Anything that filters silently gets a unit test (`test-predictleads.mjs`), and regexes are written with the Write tool, never through bash.
- **A leading word boundary in an alternation.** `/\bchief|cto|.../` anchors only the first branch, so `cto` matched inside `director` and every director was classified an executive. Every alternative carries its own boundaries: `/\b(chief|cto|...)\b/`. Caught by `test-match.mjs`, never by the screen.
- **Ranking before pulling.** The bands are computed from signal and role counts, so `map-market` after `signals` and `jobs`, never before. `npm run refresh` fixes the order.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Local dev |
| `npm run build` | Production build, the pre-push gate |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run migrate` | Apply pending migrations over the unpooled connection |
| `npm run verify:ai` | Confirm the OpenAI key and model rates resolve |
| `npm run import:desk` | Load the Desk Command Center workbook from `ALAC_DATA_DIR`: account queue, signal log, performance. Mirrors the workbook, so it prunes what it does not see |
| `npm run refresh` | Signals, then roles, then re-rank the bands. What the Monday and Thursday Action runs |
| `npm run signals -- --apply` | Pull and score PredictLeads events for Work now and Up next. Plan only without `--apply` |
| `npm run jobs -- --apply` | Pull open roles for the same 50, qualify, score relevance. `--today` lists what appeared in 24 hours |
| `npm run map` | Re-rank the market into Work now, Up next, Backlog. Free |
| `npm run rescore` | Recompute role relevance for every stored role. Free, no network |
| `npm run test:unit` | xlsx, heat, outreach, PredictLeads and next-move checks. Fast, no database, no network |
| `npm run test:e2e` | Playwright. **Daniyal runs this, not Claude.** Write the specs, hand him the verification step. |

## Reference

`../pulse/app/` is the sibling app these conventions come from: read it for the Supabase client split, the RPC and RLS patterns, and the migration style. Domain logic there is an ATS and does not apply here.
