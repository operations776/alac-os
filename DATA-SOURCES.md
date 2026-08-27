# Where the data comes from

Every number on a screen in this app arrives through one of five services. This
is the map: what each one is for, which endpoint or actor is called, what it
costs, how often it runs, and what it is deliberately not used for.

Written because the split is not obvious and the reasons are financial. The
same job posting can be fetched three different ways at a large price
difference, and the wrong choice does not fail loudly, it just quietly spends
the budget.

---

## The short version

| Job | Service | Why it and not the others |
| --- | --- | --- |
| What just happened at a company | **PredictLeads** | Asked by domain, answers immediately with dated, sourced events |
| Open roles at a company | **PredictLeads** | Same call family, employer's own board link, salary where published |
| Open roles, wider market | **Apify** | ~$0.40 per 1,000 postings for the companies PredictLeads has no record of |
| Find people and their emails | **Prospeo** | 1 credit per request, not per person |
| Read recent news | **Exa** | Built for machines reading articles. No key set yet |
| Write the message | **OpenAI** | Everything above is input to this |

**Fiber is gone.** It was a watcher that had to be told which companies to
watch and then waited. Its tracker list was never created, so it never
produced a signal. PredictLeads answers on day one. The client, the poller, the
setup script and their fixtures were deleted in ALAC-67.

---

## PredictLeads: signals and roles

[`src/lib/server/integrations/predictleads.mjs`](src/lib/server/integrations/predictleads.mjs).
Base `https://predictleads.com/api/v3`, two headers, `X-Api-Key` and
`X-Api-Token`, both required. A request missing either is a 401 with no body.

### Signals

`GET /companies/{domain}/news_events`. Fourteen categories are kept, weighted
by how directly each implies a company is about to need people:

| Category | Weight | In words |
| --- | --- | --- |
| `receives_financing` | 30 | Raised money |
| `increases_headcount_by` | 28 | Grew headcount |
| `hires` | 24 | Hired someone senior |
| `expands_offices_to` / `_in` | 22 / 20 | Opened or expanded an office |
| `expands_facilities` | 20 | Expanded facilities |
| `leaves` | 18 | Someone senior left, a seat to fill |
| `acquires` | 16 | Acquired a company |
| `signs_new_client` | 14 | Won a client |
| `launches` | 12 | Launched something |
| `has_valuation` | 10 | New valuation |
| `invests_into` / `partners_with` / `closes_offices_in` | 8 / 6 / 4 | |

Every event carries a date (`effective_date`, falling back to `found_at`), a
confidence, and the article it came from. Events below **0.65 confidence are
dropped**: observed live, a 0.52 executive hire cited an article about
something else, while everything above 0.7 checked out. A wrong signal in
front of the operator costs more than a missing one.

Each kept event is scored on all six heat components by the same
`scoreHeat()` every other signal goes through, then written with a conflict on
`(org_id, external_id)` so a rerun updates in place and recency decays.

### Roles

`GET /companies/{domain}/job_openings`. `posted_at` is null on every row seen,
so `first_seen_at` is the date used: when the posting entered the feed, the
closest honest proxy for when it went up. The URL is the employer's own board,
so a role on screen is one click from the live posting.

`qualifyRole()` decides which count. **Out:** intern, internship, apprentice,
student, receptionist, office manager, janitor, barista, driver. **In:**
engineer, engineering, scientist, architect, developer, technician, program,
product, director, VP, vice president, head, chief, principal, staff, lead,
manager. Roles that fail are stored and marked unqualified, not dropped:
"hiring, but not for anything we can help with" is a different answer from
"not hiring".

Each qualified role gets a **relevance** out of 100 from
[`src/lib/scoring/roles.mjs`](src/lib/scoring/roles.mjs): freshness first
(45 points inside a day, 6 after a month), then seniority, discipline, and
whether a salary is published. Stored, and recomputed on every pull because it
decays.

### Scope and cost

Both pulls are scoped to **Work now and Up next**, 50 companies. The backlog
is 910 companies nobody is contacting this week. The signal call is cheap to
repeat; the roles call is metered, which is why the refresh is twice a week
rather than daily.

---

## The refresh

`npm run refresh` runs three steps in order:

1. `signals-predictleads.mjs --apply`: pull and score events for the 50.
2. `jobs-pull.mjs --apply`: pull roles for the 50, qualify, score relevance.
3. `map-market.mjs`: re-rank the whole market into Work now, Up next, Backlog
   from fit, what changed, who you know, and what went up this week.

It runs on a schedule from `.github/workflows/refresh.yml`, **Monday and
Thursday at 06:00 UTC**, and by hand from the Actions tab. The three secrets it
needs (`DATABASE_URL_UNPOOLED`, `PREDICTLEADS_API_KEY`,
`PREDICTLEADS_API_TOKEN`) live in the repository's Actions secrets, not in
Vercel: the app never calls PredictLeads at request time, it only reads what
the refresh wrote.

Order matters. The map reads signal and role counts, so ranking before pulling
would rank last week's world.

### How companies move between bands

Stated in [`src/config/desk.mjs`](src/config/desk.mjs) and enforced in
[`src/lib/scoring/bands.mjs`](src/lib/scoring/bands.mjs):

- Every refresh re-ranks the whole market. Nobody is stuck in a band.
- A company leaves Work now when marked On hold, or when its rank falls below
  25 because others moved ahead. The top of Up next takes the slot.
- Heat 60 or more inside 30 days guarantees at least Up next, whatever the fit
  score says. That is how a signal on What changed enters the working list.
- Approved companies stay in Work now until outreach is loaded.

---

## Apify: the wider market

Two actors in
[`src/lib/server/integrations/apify.mjs`](src/lib/server/integrations/apify.mjs),
both overridable by env var because actors get renamed, deprecated, or start
demanding rent.

| Purpose | Actor | Override with |
| --- | --- | --- |
| Company identity | `harvestapi/linkedin-company` | `APIFY_COMPANY_ACTOR` |
| Open jobs | `curious_coder/linkedin-jobs-scraper` | `APIFY_JOBS_ACTOR` |

Jobs are searched by numeric LinkedIn org id (`f_C=<id>`), never by company
name: a name search for one satellite company returned SpaceX and two others
mixed in, and those postings would have been silently attributed to the wrong
account. `resolveCompanies()` gets the id first. LinkedIn returns the literal
string "Not Applicable" for unset seniority; it becomes null.

Used for companies PredictLeads has no record of, and for the monthly wider
pull. About $0.40 per 1,000 postings.

---

## Prospeo: people and emails

[`src/lib/server/integrations/prospeo.mjs`](src/lib/server/integrations/prospeo.mjs).

| Endpoint | Cost |
| --- | --- |
| `search-person` | 1 credit per request returning 1+ people, not per person |
| `enrich-company` | 1 credit per match, free when no match |
| `enrich-person` | 1 credit per email found, nothing when none |

`enrich-company` replaced domain guessing, which got 9 of the first 14 wrong.
A wrong domain poisons everything downstream. Emails are revealed one at a time
from the account page, on demand, never in bulk.

---

## Exa: recent coverage

[`src/lib/server/integrations/exa.mjs`](src/lib/server/integrations/exa.mjs).
`researchCompany()` uses `category: "news"`, a 180 day floor, and excludes the
company's own domain. **No key is set.** Without it the message writer works
from stored facts only.

---

## OpenAI: the writing

[`src/lib/server/ai/outreach.mjs`](src/lib/server/ai/outreach.mjs) assembles
the signal, the roles, the research and the person into a context block and
writes one message. Every factual claim is checked back against that block. A
draft that references anything absent, drops the credential, repeats the
number, or uses a banned phrase is rejected. About $0.001 per message. Nothing
sends: a human copies and sends.

---

## The warm network

`people` is the operator's own LinkedIn connections export, loaded by
`import:desk` and matched to accounts by normalised company name. It does not
refresh itself. **Re-export and reload monthly.** The Your network screen shows
when it was last loaded.

---

## Who owns which field

| Field | Owner | Anything else that shows it is a mirror |
| --- | --- | --- |
| Priority, final score, record id | Master TAM workbook | never written here |
| Approach, progress, next action, next week | Desk workbook, account queue tab | imported, read only here |
| LinkedIn and email stage | Desk workbook, until SourceWhale API is connected | then SourceWhale |
| Work band, work reason, work score | This app, `map-market` | recomputed every refresh |
| Signals, heat score | This app, from PredictLeads and the workbook log | |
| Roles, relevance | This app, from PredictLeads and Apify | |
| People, decision maker flag | LinkedIn export | reloaded monthly |
| Targets, emails | Prospeo, on demand | |
| Drafts, briefs | This app, OpenAI | rejected if ungrounded |
| Lifecycle stage, next move | Derived on read from the above | never stored |

---

## Keys

| Variable | For | Where |
| --- | --- | --- |
| `PREDICTLEADS_API_KEY` + `_TOKEN` | Signals, roles | Actions secrets, local `.env.local` |
| `APIFY_TOKEN` | Wider jobs, company identity | local |
| `PROSPEO_API_KEY` | People, emails, domains | Vercel (reveal button), local |
| `OPENAI_API_KEY` | Message writing | local |
| `EXA_API_KEY` | Recent coverage | **not set** |

Keys are never logged or echoed. The PredictLeads client redacts them from
error messages.
