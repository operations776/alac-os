# ALAC OS

A business development intelligence layer for a defense and deep-tech recruiting firm.

It answers four questions in order: who are we trying to win this year and quarter, which accounts matter most right now, exactly who should be contacted today, and why, with evidence attached to every answer. The goal is to remove decision fatigue, so the operator opens it and executes rather than opening it and deciding.

It is not an ATS or a CRM. It ranks accounts, explains the ranking, and hands over the next action. Execution lives in the firm's outreach tooling.

## How it works

**Scores are deterministic. The model explains them.** A pure function scores every account 0 to 100 across five components (ICP fit, hiring signal, timing, relationship, revenue potential) and stores the full arithmetic. That runs over thousands of accounts in seconds, costs nothing, and is reproducible.

A second pass asks an LLM to explain the top accounts: why this account, why now, what to do next, what the risks are. Every claim it makes must cite a signal id that was supplied to it. A response citing anything else is rejected. That rule is enforced in code, which is what makes the reasoning auditable instead of decorative.

Tier changes are recommendations, never direct writes. A human approves every promotion and demotion.

## Private data

**This repository is public. Client data must never be committed.**

No company names, contact names, emails, or suppression lists appear in any file here, including fixtures and tests. Real CSVs live outside the repo and are read at import time from the path in `ALAC_DATA_DIR`. `.gitignore` blocks `*.csv` and `data/` at every level. Test fixtures use synthetic companies.

If you are adding a fixture, invent the data. Do not copy a real row "just for now".

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Database migrations live in `supabase/migrations/` and are applied before the code that reads them. Seed data is loaded with `npm run import:tam` and `npm run import:people`, both of which read from `ALAC_DATA_DIR` and are safe to run twice.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build, the gate before any push |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run verify:ai` | Confirm the model key and rate table resolve |
| `npm run import:tam` | Load accounts |
| `npm run import:people` | Load contacts and match them to accounts |
| `npm run score` | Score every account, then run the reasoning pass |
| `npm run test:e2e` | Playwright |

## Documentation

| File | Contents |
| --- | --- |
| `ARCHITECTURE.md` | System spec: stack, tenancy, the ten data laws, the decision engine, env table |
| `DESIGN.md` | UI contract: palette, type, spacing, component rules |
| `AI.md` | Every model call, prompt version, cost, and the grounding rules |
| `CLAUDE.md` | Operating manual for agents working in this repo |
| `TICKETS.md` | Work log |
