# Where the data comes from

Every number on a screen in this app arrives through one of five services. This
is the map: what each one is for, which actor or endpoint is called, what it
costs, and what it is deliberately not used for.

Written because the split is not obvious and the reasons are financial. The
same job posting can be fetched three different ways at a 2,400x difference in
price, and the wrong choice does not fail loudly, it just quietly spends the
budget.

**Status as of this writing:** jobs and people are live and pulling. The signal
watcher is built and switched off. See [Live status](#live-status).

---

## The short version

| Job | Service | Why it and not the others |
| --- | --- | --- |
| Watch for something happening | **Fiber** | The only one that watches rather than fetches |
| Pull open jobs | **Apify** | ~$10 against ~24,000 Fiber credits for the same work |
| Find people and their emails | **Prospeo** | 1 credit per request, 53,000 available |
| Read recent news | **Exa** | Built for machines reading articles, not for ranking pages |
| Write the message | **OpenAI** | Everything above is input to this |

The rule: **Fiber watches, Apify digs, Prospeo finds people, Exa reads.**

---

## Apify: open jobs and company identity

Two actors, both named in
[`src/lib/server/integrations/apify.mjs`](src/lib/server/integrations/apify.mjs)
and both overridable by environment variable, because actors get renamed,
deprecated, or start demanding a paid rental and that should not need a code
change.

### The actors

| Purpose | Actor | Override with |
| --- | --- | --- |
| Company identity | `harvestapi/linkedin-company` | `APIFY_COMPANY_ACTOR` |
| Open jobs | `curious_coder/linkedin-jobs-scraper` | `APIFY_JOBS_ACTOR` |

`bebity/linkedin-jobs-scraper` was the first choice and is out: its free trial
expired and it now returns `actor-is-not-rented`. Both actors above were
verified running on the current plan.

Called through `/acts/{id}/run-sync-get-dataset-items`, which runs the actor and
returns the rows in one request rather than making us poll a run id.

### Step one: company slug to numeric id

This step exists because of a real failure. LinkedIn job search filters by
numeric organisation id (`f_C=<id>`), and what we hold is name and slug.

Searching jobs by **company name** returns competitors mixed in with the target.
A keyword search for one satellite company came back with SpaceX, Antares and
Array Labs in the results, and those postings would have been silently
attributed to the wrong account. A company with 12 open roles would have shown
40, and the urgency score built on top of it would have been fiction.

So `resolveCompanies()` sends `https://www.linkedin.com/company/<slug>` to the
company actor and reads back:

- `org_id`, the numeric id, the whole point of the call
- `website`, the real domain
- `employee_count`, headcount
- `linkedin_url`

Anything without an `org_id` is dropped. **24 companies** currently have one.

### Step two: jobs by org id

`fetchJobsForOrgIds()` builds one search URL per company:

```
https://www.linkedin.com/jobs/search/?f_C=<org_id>
```

One URL per company rather than one combined search, because `f_C` takes a
single id and combining them makes it impossible to attribute a posting back to
the right account. `scrapeCompany: false` is set, since company detail is
already known from step one and asking again on every posting multiplies cost
for nothing.

### Normalising a posting

Actors disagree on field names, so `normalizeJob()` reads each value from a list
of plausible keys (`title`, `jobTitle`, `position`, `name`). Anything
unidentifiable is left null rather than guessed: a posting with no title is not
a posting.

One specific trap: LinkedIn returns the string **"Not Applicable"** for
seniority on most postings that simply have none set. Passed through, the scorer
would treat an unstated level as a stated one. It becomes null.

Attribution back to the account uses `inputUrl`, which echoes the search URL
that produced each row, so the `f_C` id in it says which company it belongs to.

### Which roles count

`qualifyRole()` in [`scripts/enrich-account.mjs`](scripts/enrich-account.mjs)
decides. **Out:** intern, internship, apprentice, student, receptionist, office
manager, janitor, barista, driver. **In:** engineer, engineering, scientist,
architect, developer, technician, program, product, director, VP, vice
president, head, chief, principal, staff, lead, manager.

Roles that fail are **stored and marked unqualified, not dropped.** "They are
hiring, but not for anything we can help with" is a real answer and different
from "they are not hiring."

### Cost

About **$0.40 per 1,000 jobs**. The whole current pull cost roughly $10.

---

## Fiber: the watcher

Fiber sits on a list of companies and says when something happens. It is the
only service here that works that way. Everything else fetches when asked.

### The 11 rules

Configured in [`scripts/signals-setup.mjs`](scripts/signals-setup.mjs). Each is
here because it changes hiring timing, which is the only reason this desk
contacts anyone.

| Rule | Threshold |
| --- | --- |
| `new_funding_round` | over $1M |
| `funding_stage_changed` | any |
| `new_investor` | any |
| `company_news` | any |
| `headcount_growth_percent` | 15%+, growing |
| `department_size_threshold` | Engineering above 20 |
| `recently_hired_with_title` | VP, Chief, Head of, Director |
| `company_status_changed` | acquired, IPO |
| `acquired_company` | any |
| `new_office_location` | any |
| `recent_layoffs` | any |

Thresholds are deliberately loose. The heat scorer decides what matters, so the
tracker's job is recall, not precision: filtering hard here throws away signals
before they can be scored.

### Why Fiber does not pull the jobs

Fiber has a job search endpoint and it is used for **2 companies, 48 postings**
as a comparison against Apify. It stays there because it costs **1 credit per
posting found**. The full pull would have been roughly **24,000 credits against
a balance of 460**. Apify does the same work for about $10.

An early version of that call nearly ran with a guessed field name for the
result count. Reading the live response first is what caught it.

### Authentication, a trap worth recording

Fiber documents `apiKey` as a query parameter on GET and in the body on POST.
Its `fire-dummy` endpoint validates it as a required **query** parameter on a
POST and rejects a body-only call as unauthenticated. The client therefore sends
the key as query, in the body, and as `x-api-key` on every request. The extras
are inert where unused.

Keys are never echoed back in errors: `redact()` strips them from any message.

---

## Prospeo: people and emails

Three endpoints in
[`src/lib/server/integrations/prospeo.mjs`](src/lib/server/integrations/prospeo.mjs).

| Endpoint | Cost |
| --- | --- |
| `search-person` | 1 credit per request returning 1+ people, **not** per person |
| `enrich-company` | 1 credit per match, free when no match |
| `enrich-person` | 1 credit per email found, nothing when none |

The per-request pricing on `search-person` is the important detail: asking for
25 people costs the same as asking for one, so the request should be as broad as
the filters allow.

Mobile numbers come back masked and cost 10 credits to reveal. Not requested.

`enrich-company` also replaced domain guessing. Constructing domains from
company names got **9 of the first 14 wrong**, and a wrong domain poisons
everything downstream: the wrong company's jobs, the wrong people, and a message
about a business that is not theirs.

The `SENIORITY` and `DEPARTMENT` values are enums verified against the live API
(`"Vice President"`, `"Engineering & Technical"`), not guessed from docs.

Currently **36 people across 2 companies, 35 with an email.**

---

## Exa: recent coverage

[`src/lib/server/integrations/exa.mjs`](src/lib/server/integrations/exa.mjs).
Search built for machines, used for one job: finding what has actually been
written about a company recently.

`researchCompany()` uses `category: "news"` with a 180 day floor and **excludes
the company's own domain**, because a press release is the company describing
itself and the writer already has that. `researchPerson()` scopes by company
name as well as person name, since most names are not unique and referencing the
wrong person's interview is worse than referencing nothing.

Both request `text`, not just headlines. A headline says something happened; it
is not enough to say anything specific about it.

**This is the one service with no key set.** Without it the message writer works
from stored facts only, and the fuller "what changed" explanation on the signal
board writes nothing at all rather than inventing prose.

---

## OpenAI: the writing

Everything above is input.
[`src/lib/server/ai/outreach.mjs`](src/lib/server/ai/outreach.mjs) assembles a
context block of the signal, the roles, the research and the person, then writes
one message from it. Every factual claim is checked back against that block, and
a draft referencing anything absent is rejected rather than sent.

Rates live in `rates.mjs` and nowhere else, so changing the model without
changing the rate cannot silently produce a wrong cost meter.

About **$0.001 per message.**

---

## Can Apify replace Fiber?

No, and the reason is structural rather than about quality.

Searching the Apify store for funding trackers, news monitors and layoff
trackers returns actors with **46, 13, 3, 2 and 1 users**. Those are hobby
projects. The Crunchbase actors are genuinely popular (3,367 users) but they
**scrape on demand**; they do not watch.

Everything on Apify fetches when asked. Nothing sits and watches. Confirmed on
the live account: **0 schedules configured.** Replacing Fiber would mean running
scrapers on a timer across all 960 companies, storing prior state, diffing it,
and working out what is new. That is Fiber's entire product, rebuilt, on top of
scrapers each maintained by one person.

**Fiber is a smoke alarm. Apify is a flashlight. Both useful. A flashlight is
not a smoke alarm.**

One thing Apify could add cheaply later: **WARN notices**, the layoff filings
companies are legally required to file. Public records, so a scraper is
reliable. An addition, not a replacement.

---

## Live status

| Source | State | Coverage |
| --- | --- | --- |
| Apify jobs | Live | 596 roles, 502 qualified, 21 companies |
| Apify company | Live | 24 companies with a LinkedIn org id |
| Prospeo | Live | 36 people, 35 emails, 2 companies |
| Fiber jobs | Live, comparison only | 48 roles, 2 companies |
| **Fiber signals** | **Built, switched off** | **0 tracker lists exist** |
| Exa | No key | Nothing |
| OpenAI | Live | 18 drafted messages |

**All 30 signals currently in the app came from the workbook.** They were typed
in by hand. Not one came from Fiber, because the tracker list has never been
created. `npm run signals:setup -- --apply` creates it and starts the watching.
That is one command and it has not been run, because it begins watching the real
market.

---

## Commands

| Command | Does |
| --- | --- |
| `npm run verify:fiber` | Confirm the key, print the rule catalogue. Free endpoints only |
| `npm run signals:setup` | Plan the tracker list. Add `-- --apply` to create it |
| `npm run signals:pull` | Poll, parse, match, score, record. `-- --dry` writes nothing |
| `npm run enrich -- --band now` | Company id, jobs, people, emails for a band |
| `npm run draft -- --apply --band now` | Research and write the first messages |

Nothing chargeable runs by accident. `signals:pull` writes nothing with
`--dry`; `enrich` and `draft` do nothing at all without `--apply`. In both cases
the unarmed run prints what it would do and what it would spend.

---

## Keys

| Variable | For | Set |
| --- | --- | --- |
| `APIFY_TOKEN` | Jobs, company identity | Yes |
| `FIBER_API_KEY` | Signal watching, job search | Yes |
| `PROSPEO_API_KEY` | People, emails, domains | Yes |
| `OPENAI_API_KEY` | Message writing | Yes |
| `EXA_API_KEY` | Recent coverage | **No** |

Keys are never logged or echoed. Fiber's client redacts them from error
messages, which matters because its errors quote the request.
