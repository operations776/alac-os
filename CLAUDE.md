@AGENTS.md

# ALAC OS

BD intelligence layer for ALAC HR Solutions. Detail lives in `ARCHITECTURE.md` (system), `DESIGN.md` (UI contract), and `AI.md` (every model call and what it costs). This file is the operating manual only. Keep it small, it is paid for in every session.

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
- **The score is deterministic. The LLM explains it, never sets it.**
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

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Local dev |
| `npm run build` | Production build, the pre-push gate |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run migrate` | Apply pending migrations over the unpooled connection |
| `npm run verify:ai` | Confirm the OpenAI key and model rates resolve |
| `npm run import:tam` | Load accounts from `ALAC_DATA_DIR` |
| `npm run import:people` | Load warm contacts and match them to accounts |
| `npm run score` | Deterministic scoring run, then the reasoning pass |
| `npm run test:e2e` | Playwright. **Daniyal runs this, not Claude.** Write the specs, hand him the verification step. |

## Reference

`../pulse/app/` is the sibling app these conventions come from: read it for the Supabase client split, the RPC and RLS patterns, and the migration style. Domain logic there is an ATS and does not apply here.
