# ALAC OS handoff

How to move ALAC OS out of RecruiterGTM's accounts and into the new owner's GitHub, Vercel and Neon. Checked against the live accounts on 12 Nov 2026. No secret values are in this file.

## Where everything is today

| Piece | Where | Notes |
| --- | --- | --- |
| Code | GitHub `operations776/alac-os` (**public**), branch `main` | Up to date with local. Old branches `ops-merge`, `ops-polish`, `ops-emails` are already merged. |
| App | Vercel team `recruitergtm` (`operations-3595s-projects`), project `alac-os` (`prj_vXm6HcBAE53Eautpk4foBiMXOae1`) | Production is https://alac-os.vercel.app. Next.js 16, Node 24. Preview deploys sit behind Vercel SSO. |
| Database | **Neon Postgres** (not Supabase), set up through the Vercel Marketplace inside our Vercel team | Postgres 17, AWS us-east-1, db `neondb`, about 40 MB. Schemas `public` (25 tables, the desk) and `mc` (68 tables, Mission Control). Last migration applied: `0029_candidate_transcript.sql`. |
| Scheduled jobs | `vercel.json` (4 daily Vercel crons) and `.github/workflows/refresh.yml` (GitHub Actions, Mon and Thu 06:00 UTC, plus the 1st of the month) | |
| Logins | Built into the app (`users` table, database-backed sessions). No outside auth provider. | 7 users: Adrian and operations@recruitergtm.com have passwords. 5 team members have no password yet. |

The only Supabase involved is Adrian's **old** Mission Control project. Its data was never copied in (ticket ALAC-124). It is his account, not ours.

## What the new owner needs to sign up for

| Service | What for | Required? |
| --- | --- | --- |
| GitHub | Hosts the code, runs CI and the twice-weekly refresh | Yes |
| Vercel (Pro plan, since this is a business app and Hobby is for non-commercial use) | Hosting and crons | Yes |
| Neon | The database. Either neon.tech directly or Vercel Marketplace, then Neon | Yes |
| OpenAI | The reasoning pass and AI task descriptions | Strongly recommended. Without it, scores still work and the UI says AI is off. |
| PredictLeads | Signals feed (funding, exec moves, headcount) | Needed for the refresh |
| Prospeo | People search and the email reveal button | Needed for reveal |
| Apify | LinkedIn job postings and company ids | Needed for job pulls |
| Exa | Recent news behind a signal when drafting a message | Optional |
| Slack app (bot token) | Posts queued Slack messages | Optional, not live today |

Every key in our Vercel project today belongs to RecruiterGTM. The new owner should create their own, or we keep paying for their usage.

## Secrets, and where each one goes

**Vercel → Project → Settings → Environment Variables (Production)**

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Their Neon **pooled** connection string. Filled in automatically if Neon is added through Vercel Marketplace. |
| `DATABASE_URL_UNPOOLED` | Their Neon **direct** connection string. Same as above. |
| `NEXT_PUBLIC_SITE_URL` | Their production URL, e.g. `https://alac-os.vercel.app` |
| `CRON_SECRET` | Any long random string. **Unset today, so all four crons return 503.** |
| `OPENAI_API_KEY` | Their OpenAI key |
| `PROSPEO_API_KEY` | Their Prospeo key |
| `APIFY_TOKEN` | Their Apify token |
| `EXA_API_KEY` | Their Exa key (optional) |
| `SLACK_BOT_TOKEN` | Optional. Unset means messages stay queued and in-app notifications still work. |
| `NEXT_PUBLIC_MARKETING_ASSETS_URL`, `NEXT_PUBLIC_SOP_FOLDER_URL` | Optional Drive folder links |

**GitHub → repo → Settings → Secrets and variables → Actions** (used by `refresh.yml`)

| Var | Value |
| --- | --- |
| `DATABASE_URL_UNPOOLED` | Same direct Neon string as above |
| `PREDICTLEADS_API_KEY` | Their PredictLeads key |
| `PREDICTLEADS_API_TOKEN` | Their PredictLeads token (both halves are required) |

**Local `.env.local` only** (for running scripts on a laptop, never in Vercel): `ALAC_DATA_DIR` (folder holding the Desk Command Center workbook), `ALAC_SEED_PASSWORD`, `TEAM_TZ`, `MC_DATABASE_URL` (the old Mission Control Supabase, one-time import), plus the database and PredictLeads vars above.

**You can skip these:** `FIBER_API_KEY` (still set in Vercel, but no code reads it; PredictLeads replaced it), `SESSION_SECRET` (ARCHITECTURE.md lists it, but sessions are database-backed and the code never reads it), the `PG*` and `POSTGRES_*` aliases (Neon adds them, the app ignores them), and the two `NEXT_PUBLIC_SUPABASE_*` secrets in `ci.yml` (left over from the template, not needed).

## Transfer steps

### 1. GitHub

On `operations776/alac-os`, go to Settings → General → Transfer ownership, and enter their account or org. Issues, history and Actions come with it. **Actions secrets do not come with it.** Add the three listed above again.

While you're there, think about making the repo **private**. It's public today, and while client data is kept out of it, there's no reason for it to be visible.

### 2. Database (Neon)

1. The new owner creates a Neon project: **Postgres 17, AWS us-east-1** (same as now, which keeps latency the same).
2. Copy the data across. Either option works:
   - **Neon Import Data Assistant** (Neon console → Import). Paste our direct connection string as the source.
   - **pg_dump**, from any machine with PostgreSQL 17 client tools installed (this machine doesn't have them):
     ```bash
     pg_dump --no-owner --no-acl -Fc "$OLD_DATABASE_URL_UNPOOLED" -f alac.dump
     ```
     ```bash
     pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL_UNPOOLED" alac.dump
     ```
3. Check it worked: `npm run migrate` against the new DB should report nothing pending, because `schema_migrations` comes along with the data.
4. Run `delete from sessions;` on the new DB, so everyone signs in fresh on the new host.

Freeze writes during the copy, or do it at a quiet time. Anything written to the old database after the dump is lost.

### 3. Vercel

**Option A, transfer the project (recommended, because it keeps the `alac-os.vercel.app` URL).** Go to Project → Settings → General → Transfer, and pick their team. Domains, deployment history and `vercel.json` crons come with it. The Neon database does **not**: it's a Marketplace store owned by our team. So after the transfer, connect their Neon (Storage tab) and overwrite `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then swap every API key for theirs.

**Option B, start fresh.** In their Vercel, import the GitHub repo (Next.js preset, Node 24), add the env vars above, then deploy. They'll get a new `*.vercel.app` URL unless we delete our project first to free up `alac-os`.

In both cases, redeploy after changing env vars, then test: sign in, open the board, and call one cron with `Authorization: Bearer <CRON_SECRET>` to make sure it no longer returns 503.

### 4. Logins

- Their admin signs in. Adrian's account already has a password.
- Create passwords for the 5 team members from Admin → Team members, or run `npm run create:user`.
- Once they've confirmed everything works, delete the `operations@recruitergtm.com` user if RecruiterGTM should no longer have access.

### 5. Things to change in the repo after the transfer

- `CLAUDE.md` line 25 says commits must be authored as `operations776`, because Vercel blocks foreign commit authors on our account. Change it to the new owner's GitHub user, or their deploys will be rejected the same way.
- `README.md`, `ARCHITECTURE.md` section 8 and `.env.example` mention RecruiterGTM's OpenAI key and `alac-os.vercel.app`. Update them if anything changes.

### 6. Shut down our side (only after their production is verified)

- Revoke or rotate the RecruiterGTM OpenAI, Prospeo, Apify, Exa and PredictLeads keys that were used here.
- Delete the old Neon store in our Vercel team (Storage tab). This can't be undone, so take a final dump first.
- Delete our Vercel project, if Option B was used.

## Open items they inherit

| Item | State |
| --- | --- |
| Demo data | 332 fictional rows from the demo week are still in production. Remove them exactly with `npm run seed:demo -- --remove`. |
| Crons | `CRON_SECRET` was never set, so verify-roles, recurring, slack and reminders have never run in production. |
| Mission Control import (ALAC-124) | `npm run import:ops -- --apply` with `MC_DATABASE_URL` from Adrian's old Supabase. Not done. The script uses `session_replication_role = replica`, which Neon's owner role may refuse, so test it first. |
| Slack | No bot token, so nothing is posted. Also check that `mc.slack_settings.is_connected` is true. |
| SourceWhale API | Waiting on written OK from SourceWhale for AI use (ARCHITECTURE.md section 9). The CSV bridge covers it until then. |

Read next: `README.md` (setup and commands), `ARCHITECTURE.md` (system and env table), `CLAUDE.md` (rules for agents working in the repo), `TICKETS.md` (work log).
