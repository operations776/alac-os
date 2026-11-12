# ALAC OS handoff

How to move ALAC OS from RecruiterGTM's accounts into the new owner's GitHub, Vercel and Neon, on free plans throughout. Checked against the live accounts on 12 Nov 2026. **No secret values belong in this file: the repo is public until step 2.4.**

## Where everything is today

| Piece | Where | Notes |
| --- | --- | --- |
| Code | GitHub `operations776/alac-os`, branch `main` | Public. No webhooks or deploy keys. |
| App | Vercel team `recruitergtm`, project `alac-os` | https://alac-os.vercel.app. Next.js 16, Node 24. Four daily crons in `vercel.json`. |
| Database | Neon project `alac-os-db`, created through Vercel Marketplace | Postgres 17, AWS US East 1 (N. Virginia), Free plan, database `neondb`, about 40 MB. Schemas `public` (desk) and `mc` (Mission Control). Last migration `0029_candidate_transcript.sql`. |
| Refresh job | `.github/workflows/refresh.yml` | GitHub Actions, Mon and Thu 06:00 UTC, plus the 1st of the month. |
| Logins | Built into the app (`users` table) | 7 users. Adrian and operations@recruitergtm.com have passwords, 5 team members do not yet. |

A Neon database made through someone's Vercel account cannot be handed to another person. The new owner makes their own free Neon project and copies the data in (step 1).

## What it costs

Nothing on RecruiterGTM's side: the new owner is never added to our Vercel team (that would be a paid seat). Everything moves to their free plans:

- GitHub: free.
- Vercel: Hobby (free). Daily crons are allowed on Hobby. Vercel's terms reserve Hobby for non-commercial use, so upgrading to Pro is their call.
- Neon: Free plan, 0.5 GB. The database is about 40 MB.

## Before moving day (new owner, about 15 minutes)

1. **GitHub:** have an account, and send Daniyal the username.
2. **Vercel:** sign up at vercel.com on the Hobby plan with "Continue with GitHub", same GitHub account.
3. **Neon:** sign up at neon.tech, Free plan. **Do not create a project yet**: the import in step 1 creates it.
4. **API keys**, all in their own name: OpenAI, Prospeo, Apify, PredictLeads (key and token), Exa (optional). A missing key turns that one feature off and the app says so. Nothing breaks.

## Moving day

Pick a quiet hour. The app is down for about 10 minutes between steps 3 and 4. **Nobody edits anything in the app from step 1 onward**, because anything written to the old database after the copy is lost.

### Step 1. Copy the database (screen share, both)

Daniyal gets the **source** string: in the old Neon project `alac-os-db`, click **Connect**, turn **Connection pooling off**, copy. It is the host without `-pooler`. Get it to the new owner privately: type it into their field yourself over a screen share with remote control, or send a one-time secret link (for example onetimesecret.com). Never in a Slack or email message.

**Option A, Neon Import Data Assistant (no installs, under 10 GB, 1 hour limit):** ([Neon docs](https://neon.com/docs/import/import-data-assistant))

1. New owner, in their Neon console, goes to the **Projects page** (the list of all projects, not inside a project) and clicks the **Import** option there to launch the Import Data Assistant.
2. Paste the source string into the **connection string** box and click **Run Checks**. If it is refused, remove `&channel_binding=require` from the end and run again.
3. Click **Create new Neon project**: **Postgres 17**, region **AWS US East 1 (N. Virginia)**. Click **Create**.
4. Click **Start import process**. The old database is only read, never changed.
5. When it finishes, open the new project, click **Connect**, and copy two strings for step 4.3: **pooled** (pooling on, host has `-pooler`) and **direct** (pooling off).

**Option B, pg_dump (any machine with PostgreSQL 17 client tools):**

```bash
pg_dump --no-owner --no-acl -Fc "SOURCE_DIRECT_STRING" -f alac.dump
```

```bash
pg_restore --no-owner --no-acl -d "THEIR_DIRECT_STRING" alac.dump
```

**Check the copy** in their Neon **SQL Editor**:

```sql
select count(*) from users;                -- expect 7
select max(filename) from schema_migrations; -- expect 0029_candidate_transcript.sql
delete from sessions;                       -- everyone signs in fresh on the new host
```

### Step 2. Clean up and hand over GitHub (Daniyal)

GitHub **moves Actions secrets with the repo**, and today they hold RecruiterGTM's database string and PredictLeads keys. Remove them first.

1. Delete the merged branches:
   ```bash
   git push origin --delete ops-emails ops-merge ops-polish
   ```
2. Delete RecruiterGTM's secrets:
   ```bash
   gh secret delete DATABASE_URL_UNPOOLED -R operations776/alac-os
   ```
   ```bash
   gh secret delete PREDICTLEADS_API_KEY -R operations776/alac-os
   ```
   ```bash
   gh secret delete PREDICTLEADS_API_TOKEN -R operations776/alac-os
   ```
3. Repo **Settings → General → Danger Zone → Change repository visibility → Private**.
4. Same Danger Zone: **Transfer ownership**, enter their username, confirm. They accept from their email.

### Step 3. Detach the old database from Vercel (Daniyal)

Vercel → project **alac-os → Storage** → the Neon database → **Disconnect** from alac-os. The app goes down here until step 4.6. This leaves nothing in the project tied to RecruiterGTM's account before it moves.

### Step 4. Hand over the Vercel project (Daniyal, then new owner)

1. Daniyal creates a project transfer request (`POST /v1/projects/alac-os/transfer-request` with the RecruiterGTM team id). It returns a claim link, valid 24 hours: `https://vercel.com/claim-deployment?code=...`
2. New owner opens the link, picks their account, accepts. The project moves with `alac-os.vercel.app`, its deployments and its crons.
3. **Settings → Environment Variables**, Production. Replace any old copy of a var:

   | Var | Value |
   | --- | --- |
   | `DATABASE_URL` | their **pooled** Neon string |
   | `DATABASE_URL_UNPOOLED` | their **direct** Neon string |
   | `NEXT_PUBLIC_SITE_URL` | `https://alac-os.vercel.app` |
   | `CRON_SECRET` | any long random string |
   | `OPENAI_API_KEY` | theirs |
   | `PROSPEO_API_KEY` | theirs |
   | `APIFY_TOKEN` | theirs |
   | `EXA_API_KEY` | theirs, optional |
   | `SLACK_BOT_TOKEN` | optional |
   | `NEXT_PUBLIC_MARKETING_ASSETS_URL`, `NEXT_PUBLIC_SOP_FOLDER_URL` | optional Drive links |

   Delete `FIBER_API_KEY` (nothing reads it) and any leftover `PG*` or `POSTGRES_*` vars.
4. **Settings → Git**: connect their copy of the repo.
5. **Deployments**: latest deployment, **Redeploy**.
6. Test: sign in, open the board, and check that this returns 200 rather than 503:
   ```bash
   curl -H "Authorization: Bearer THEIR_CRON_SECRET" https://alac-os.vercel.app/api/cron/reminders
   ```

### Step 5. GitHub Actions secrets (new owner)

Their repo **Settings → Secrets and variables → Actions**, add `DATABASE_URL_UNPOOLED` (their direct string), `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN`. Then **Actions → Refresh the desk → Run workflow** once to check it.

## After it is confirmed working

**Daniyal:**

1. Delete the old database: Vercel → RecruiterGTM team → **Storage** → `alac-os-db` → **Settings → Delete**. This also kills the old connection string that was shared on moving day. Cannot be undone, which is why it waits.
2. Revoke RecruiterGTM's OpenAI, Prospeo, Apify, Exa and PredictLeads keys used here.

**New owner:**

1. In the app, **Admin → Team members**: set passwords for the 5 team members, and remove `operations@recruitergtm.com` if RecruiterGTM should no longer have access.
2. **Settings → Environments** in GitHub: `Preview` and `Production` can be deleted; Vercel recreates them.
3. In `CLAUDE.md`, change "Commits are authored as `operations776`" to their GitHub user. Hobby only deploys commits by the account owner.

## Secrets reference

| Var | Where | Needed for |
| --- | --- | --- |
| `DATABASE_URL` | Vercel | Every request. The app cannot boot without it. |
| `DATABASE_URL_UNPOOLED` | Vercel, GitHub Actions, local | Migrations, importers, the refresh job |
| `NEXT_PUBLIC_SITE_URL` | Vercel | Auth redirects |
| `CRON_SECRET` | Vercel | The four crons. Unset means they return 503. |
| `OPENAI_API_KEY` | Vercel | Reasoning pass and AI task descriptions |
| `PROSPEO_API_KEY` | Vercel | People search and email reveal |
| `APIFY_TOKEN` | Vercel, local | Job postings and LinkedIn company ids |
| `EXA_API_KEY` | Vercel | News behind a signal when drafting |
| `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN` | GitHub Actions, local | The refresh. Both halves required. |
| `SLACK_BOT_TOKEN` | Vercel | Optional Slack delivery |
| `ALAC_DATA_DIR`, `ALAC_SEED_PASSWORD`, `TEAM_TZ`, `MC_DATABASE_URL` | local only | Scripts |

Not needed: `FIBER_API_KEY`, `SESSION_SECRET` (listed in ARCHITECTURE.md, never read), the `PG*` and `POSTGRES_*` aliases, and the `NEXT_PUBLIC_SUPABASE_*` lines in `ci.yml`.

## Open items they inherit

| Item | State |
| --- | --- |
| Demo data | 332 fictional rows still in production. `npm run seed:demo -- --remove` takes out exactly those. |
| Crons | `CRON_SECRET` was never set, so the four crons have never run in production. Fixed by step 4.3. |
| Mission Control import (ALAC-124) | `npm run import:ops -- --apply` with `MC_DATABASE_URL` from Adrian's old Supabase. Not done. It uses `session_replication_role = replica`, which Neon's owner role may refuse, so test first. |
| Slack | No bot token. Also check `mc.slack_settings.is_connected` is true. |
| SourceWhale API | Waiting on SourceWhale's written OK for AI use (ARCHITECTURE.md section 9). The CSV bridge covers it until then. |

Read next: `README.md` (setup, commands), `ARCHITECTURE.md` (system, env table), `CLAUDE.md` (rules for agents), `TICKETS.md` (work log).
