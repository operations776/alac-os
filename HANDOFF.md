# Taking over ALAC OS

This guide is for you, the new owner. It takes you from nothing to running ALAC OS on your own GitHub, Vercel and Neon accounts. Everything here works on free plans.

**What you are getting:** ALAC OS, the desk command center (account queue, signal heat, Top 25 and Next 25, performance) with Mission Control (board, tasks, content, GTM, requisitions, SOPs) built in. It runs at https://alac-os.vercel.app.

**How it fits together:**

| Part | What it does | Where it will live |
| --- | --- | --- |
| Code | This repository | Your GitHub |
| App | The website your team logs into | Your Vercel |
| Database | All the data: accounts, signals, tasks, users | Your Neon |
| Refresh | Pulls new signals and roles every Monday and Thursday | GitHub Actions in your repo |

Daniyal sends you three things during the move: a **GitHub transfer email**, a **database connection string** (privately), and a **Vercel claim link**. You do the rest below.

## Before you start (15 minutes)

1. **GitHub:** have an account. Send Daniyal your username.
2. **Vercel:** sign up at vercel.com, Hobby (free) plan, with **Continue with GitHub** using that same account.
3. **Neon:** sign up at neon.tech, Free plan. Do not create a project, step 2 does that.
4. **API keys**, in your own name. Each one powers one feature. If you skip one, that feature switches off and the app says so. Nothing breaks.

| Service | Powers | Get it at |
| --- | --- | --- |
| OpenAI | AI reasoning and task descriptions | platform.openai.com/api-keys |
| PredictLeads | The signal feed (funding, exec moves, headcount) | predictleads.com (you get a key and a token) |
| Prospeo | People search and the email reveal button | app.prospeo.io/settings/api |
| Apify | Job postings | console.apify.com/settings/integrations |
| Exa | News behind a signal when drafting a message (optional) | exa.ai |

## Step 1. Accept the GitHub repository

1. Open the transfer email from GitHub and accept. The repository is now under your account.
2. In the repository, go to **Settings → General**, scroll to the bottom (**Danger Zone**), and set it to **Private** if it is not already.

## Step 2. Create your database

Daniyal sends you a connection string for the current database. It contains a password, so keep it private.

1. Log in at console.neon.tech. Stay on the **Projects** page, the list of all your projects.
2. Click **Import** to open Neon's Import Data Assistant. Can't see it? Type "import" into the search bar at the top.
3. Paste the string into the **connection string** box and click **Run Checks**. If it shows an error, delete `&channel_binding=require` from the end of the string and run it again.
4. Click **Create new Neon project**. Choose **Postgres 17** and region **AWS US East 1 (N. Virginia)**. Click **Create**.
5. Click **Start import process** and wait for it to finish. It takes a few minutes.
6. Open your new project and click **Connect**. Copy two strings and keep them for step 3:
   - **Pooled:** connection pooling **on**. The address contains `-pooler`.
   - **Direct:** connection pooling **off**.
7. Check it worked: open **SQL Editor**, run `select count(*) from users;`. You should see **7**. Then run `delete from sessions;` so everyone signs in fresh.

Full Neon instructions: https://neon.com/docs/import/import-data-assistant

## Step 3. Accept the Vercel project

1. Open the claim link from Daniyal (it works for 24 hours). Choose your account and accept. The project moves to you with its address, alac-os.vercel.app.
2. Open the project and go to **Settings → Environment Variables**. Add each of these for **Production**. If one already exists, edit it and replace the value.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Your **pooled** Neon string |
| `DATABASE_URL_UNPOOLED` | Your **direct** Neon string |
| `NEXT_PUBLIC_SITE_URL` | `https://alac-os.vercel.app` |
| `CRON_SECRET` | Any long random text, like a strong password. It protects the scheduled jobs. |
| `OPENAI_API_KEY` | Your OpenAI key |
| `PROSPEO_API_KEY` | Your Prospeo key |
| `APIFY_TOKEN` | Your Apify token |
| `EXA_API_KEY` | Your Exa key (optional) |

   Delete any of these if you see them, the app does not use them: `FIBER_API_KEY`, and anything starting with `PG` or `POSTGRES_`.

3. Go to **Settings → Git** and connect your `alac-os` repository.
4. Go to **Deployments**, open the top one, and click **Redeploy**. Changes to settings only take effect after a redeploy.

## Step 4. Turn on the twice-weekly refresh

1. In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret**. Add three:
   - `DATABASE_URL_UNPOOLED`: your **direct** Neon string
   - `PREDICTLEADS_API_KEY`: your PredictLeads key
   - `PREDICTLEADS_API_TOKEN`: your PredictLeads token
2. Go to the **Actions** tab, click **Refresh the desk**, then **Run workflow**. A green tick means it works. After that it runs on its own every Monday and Thursday.

## Step 5. Check everything works

- Open https://alac-os.vercel.app and sign in. Adrian's existing login works.
- The board and account queue show your data.
- Tell Daniyal it is working, so he can shut down the old database and old keys.

## Step 6. Set up your team's logins

In the app, go to **Admin → Team members**.

- Set passwords for the five team members who do not have one yet.
- Remove `operations@recruitergtm.com` once you no longer need RecruiterGTM's help.

## Good to know

**Free plan limits.** Vercel's Hobby plan is meant for non-commercial use, so you may want Pro ($20 a month) later. Neon's free plan holds 0.5 GB, and the database is about 40 MB today.

**Who can deploy.** On Vercel Hobby, only commits made by the account owner go live. Whoever works on the code should commit as you. Update the line in `CLAUDE.md` that says commits are authored as `operations776`.

**Scheduled jobs.** Four jobs run every day (role checks, recurring tasks, reminders, Slack messages). They only run once `CRON_SECRET` is set.

**Optional extras** (add in Vercel environment variables when you want them):

| Name | Turns on |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack messages from the board. Without it they stay queued and in-app notifications still work. |
| `NEXT_PUBLIC_MARKETING_ASSETS_URL` | A link to your marketing Drive folder on the Content board |
| `NEXT_PUBLIC_SOP_FOLDER_URL` | A link to your SOP Drive folder on the SOPs page |

## Still to do

| Item | What to do |
| --- | --- |
| Demo data | About 330 practice rows from a demo week are still in the app. A developer runs `npm run seed:demo -- --remove` to take out exactly those. |
| Old Mission Control data | The data in the old Mission Control (Supabase) was never copied across. A developer runs `npm run import:ops -- --apply` with that database's connection string. |
| SourceWhale | Using the SourceWhale API with AI needs SourceWhale's written OK. Until then the CSV export and import does the same job. |

## For developers

Read `README.md` first (setup and commands), then `ARCHITECTURE.md` (how the system works, every setting), `CLAUDE.md` (rules for AI agents working in the repo) and `TICKETS.md` (history of changes). To run it locally, copy `.env.example` to `.env.local` and fill in the same values as above.
