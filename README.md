# ALAC OS

The desk command center for a defense and deep-tech recruiting firm.

It is the application form of the operating workbook the desk already runs on. Four screens, in the order the work happens: the **command board** is the picture, the **account queue** is where preparation happens one company at a time, **signal heat** says what just changed, and **performance** is the Thursday review of where the desk is losing time.

It is not an ATS or a CRM. It prepares accounts and hands over a decision. Execution lives in HeyReach and SourceWhale.

## How it works

**Two scores, and only one of them is ours.**

The **TAM final score** and its Priority 1/2/3 band are finalized upstream in the Master TAM. This app imports them and never writes them back. Top 25 and Next 25 are not stored tiers: they are ranked at read time, priority first and then final score, so a stored value can never drift away from the ranking that defines it.

The **heat score** is the computed one. Each signal is scored out of 100 across six components, hiring urgency out of 30, ICP fit out of 20, capital out of 15, talent scarcity out of 15, access out of 10, and freshness out of 10. Every screen shows the six components next to the total, and says so when they disagree, which is what keeps the breakdown an audit trail instead of decoration.

The number the desk acts on is the gap between them. A signal well above its account's TAM rank is a company whose timing has moved ahead of its qualification, and a third of the signal log is companies that have produced a signal before the TAM has caught up with them at all.

**Preparation is a handover, not a status.** An account moves NOT STARTED to IN RESEARCH to READY FOR QC, and READY FOR QC is itself the request for a decision. The app evaluates that checklist per account rather than restating it, and says so when an account is marked ready with work still open.

## Private data

**This repository is public. Client data must never be committed.**

No company names, contact names, emails, or suppression lists appear in any file here, including fixtures and tests. The real workbook lives outside the repo and is read at import time from the path in `ALAC_DATA_DIR`. `.gitignore` blocks `*.csv`, `*.xlsx` and `data/` at every level. Test fixtures are synthetic.

If you are adding a fixture, invent the data. Do not copy a real row "just for now".

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run migrate                # apply schema
npm run dev
```

The database is Neon Postgres. `DATABASE_URL` and `DATABASE_URL_UNPOOLED` come from `vercel env pull` if the project is linked, or from a Neon connection string directly.

Migrations are numbered SQL files in `migrations/`, applied by `npm run migrate` over the unpooled connection and recorded in `schema_migrations`. Each one runs in a transaction, so a failure leaves nothing half applied. Migrations always deploy before the code that reads them.

Data is loaded with `npm run import:desk`, which reads the Desk Command Center workbook from `ALAC_DATA_DIR` and is safe to run twice. It mirrors the workbook rather than only adding to it, so a company dropped from the queue is pruned here too.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build, the gate before any push |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run verify:ai` | Confirm the model key and rate table resolve |
| `npm run import:desk` | Load the workbook: account queue, signal log, performance |
| `npm run test:unit` | The xlsx parser checks, no database needed |
| `npm run test:e2e` | Playwright |

## Documentation

| File | Contents |
| --- | --- |
| `ARCHITECTURE.md` | System spec: stack, tenancy, the ten data laws, the decision engine, env table |
| `DESIGN.md` | UI contract: palette, type, spacing, component rules |
| `AI.md` | Every model call, prompt version, cost, and the grounding rules |
| `SCORING.md` | How targets are chosen, in plain English. Which 25 to work, how a company is scored, which signals are watched |
| `CLAUDE.md` | Operating manual for agents working in this repo |
| `TICKETS.md` | Work log |
