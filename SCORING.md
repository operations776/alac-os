# How targets are chosen

Plain English, for anyone who has to trust or challenge the output. Every
number below is produced by code in this repo and can be traced to its inputs.

The three questions this answers:

1. Which 25 companies do we work this week, and why those?
2. How is a company scored?
3. Which signals are we watching?

---

## 1. Which 25 to work

Every company in the working market gets one number out of 100, the **work
score**. Sort by it, take the top 25 for **Work now**, the next 25 for **Up
next**, and everything else is the **Backlog**.

The backlog is not a rejection. It is the list the next signal promotes from:
a company sitting at 40 today moves up the moment it raises money or opens ten
roles.

### The working market is 961, not 3,045

The master list holds 3,045 companies. Only 961 are ranked:

| Included | Why |
| --- | --- |
| Priority 1 | 84 companies, the firm's own top band |
| Priority 2 | 874 companies |
| UNSCORED strategic | 3 companies on the list but not yet scored |
| Anything flagged for next week | regardless of priority |

**Priority 3 is excluded.** That is 2,072 companies nobody is working. Ranking
them would put two thousand rows into a backlog nobody opens, and would spend
the enrichment budget on companies that are not in play.

### The work score, out of 100

Three inputs, weighted deliberately.

| Part | Max | What it measures |
| --- | --- | --- |
| **Fit** | 55 | Where the master list already put them |
| **Urgency** | 30 | Something changed, and how recently |
| **Reach** | 15 | Whether you already know someone there |

**Fit dominates on purpose.** The master list is a considered judgement made
with more context than this app has. Urgency moves a company up but cannot
rescue a poor fit: a badly fitting company that just raised money is still a
badly fitting company.

**Fit** is the priority band plus a share of the final score:

```
Priority 1   40 points     Priority 3    8 points
Priority 2   25 points     UNSCORED     20 points
plus final score / 100 × 15
```

**Urgency** is the heat score scaled to 22 points, plus up to 8 more when a
signal is *hotter than the company's standing rank*. That second part is the
interesting one: it means the master list has not caught up with this company
yet.

**Reach** is the warm network:

```
a known decision maker    4 points each, up to 10
other first degree        1 point each, up to 5
```

A known decision maker is worth more than three unknown contacts, because it
changes the odds of a reply more than anything else on the list.

### What it looks like in practice

Live, as of the last ranking run:

| Score | Company | Fit | Urgency | vs rank | Known | Roles |
| --- | --- | --- | --- | --- | --- | --- |
| 80 | Neros Technologies | 94 | 80 | -14 | 2 | 33 |
| 80 | Path Robotics | 86 | 77 | -9 | 4 | 23 |
| 79 | GrayMatter Robotics | 86 | 74 | -12 | 3 | 11 |
| 77 | Astranis | 95 | 59 | -36 | 6 | 52 |
| 76 | Shield AI | 82 | 64 | -18 | 15 | 43 |
| **71** | **Space Kinetic** | **70** | **88** | **+18** | 4 | 21 |

**Space Kinetic is the case the whole system exists for.** It is only Priority
2 with a fit of 70, so on the master list alone it would sit well down the
page. It ranks sixth because something significant just happened and its
urgency, 88, is 18 points above its standing rank. That is a company the
master list has not caught up with.

### Ties

Equal scores break on company name, alphabetically. It is arbitrary, and
deliberately so: an arbitrary rule that is stated is better than a hidden one
that looks meaningful.

---

## 2. How a company is scored

There are **two separate scores** and they answer different questions. Keeping
them apart is the single most important thing to understand.

### Fit score, out of 100. Not ours.

Comes from the Master TAM. Finalized upstream by the firm. This app **imports
it and never writes it back**, because the operating instructions say so:

> "Priority, Final Score, Record ID, Company, and LinkedIn are source data. Do
> not change them."

If the fit score is wrong, it is fixed in the master list, not here.

### Urgency score, out of 100. Ours.

Computed from six checks. Same inputs always produce the same number, and every
score stores the arithmetic behind it.

| Check | Max | What feeds it | Where from |
| --- | --- | --- | --- |
| How urgently they are hiring | 30 | qualified open roles, seniority, how recently posted | Apify |
| How well they fit | 20 | the TAM priority band | already held |
| Money involved | 15 | funding or contract amount, log scale | Fiber signal |
| How hard the roles are | 15 | clearances, deep specialisms, seniority in the titles | Apify |
| Who you know there | 10 | warm contacts, decision makers weighted higher | already held |
| How recent | 10 | days since the signal | arithmetic |

**Two of the six need no vendor at all.** "Who you know there" comes from the
existing LinkedIn connections and "how recent" is a date calculation.

### Three rules that make the number trustworthy

**1. A missing input scores nothing, not zero.**

"We did not look" and "we looked and found nothing" are different facts, and
only the second should push a company down. An empty job list scores 0. An
absent job list is recorded as a gap with a stated reason.

**2. Every score reports its coverage.**

Coverage is the share of the 100 points that could actually be assessed. A 62
built from all six checks and a 62 built from three are different claims, and
the screen says which. Astranis currently scores 59 at 85% coverage.

**3. Nothing reads the clock.**

The scoring date is passed in, not taken from `now()`. A scorer that reads the
clock gives a different answer on every run, which makes a stored breakdown
impossible to reconcile.

### Money is a log scale

```
$10M   →  5 points
$100M  → 10 points
$1B    → 15 points
```

Each tenfold increase is worth the same. Without this a single mega round would
swamp every other check, and a $900M raise would look nearly twice as urgent as
a $500M one, which is not how hiring works.

### The number the desk acts on

**Urgency minus fit score.** Positive means something just happened that makes
this company more urgent than its standing rank suggests. That is the whole
point of running two scores instead of one.

---

## 3. Is it linked to his personal connections?

**Yes, and it is one of the six scoring checks.**

| | Count |
| --- | --- |
| Contacts in the network | 843 |
| Matched to a company | 360 |
| Companies with at least one | 111 |
| In Work now, with a warm contact | 22 of 25 |

Contacts are matched to companies by normalized company name. The network is
used three ways:

1. **In the score.** "Who you know there", up to 10 points.
2. **In the ranking.** Reach, up to 15 points of the work score.
3. **In the contact list.** Known people are merged with sourced ones and
   ranked together, and a first degree connection carries a **+25 bonus**.

That third one was a bug once. The first version ranked bought contacts only,
so the system was recommending a cold approach at Anduril while **28 people
there were already first degree connections**. Sourced and known contacts now
compete in one list.

### What it cannot do

Matching is on company name only. A contact whose employer is recorded
differently from the master list will not match. 483 of the 843 contacts are
currently unmatched, mostly because they work at companies outside the 961.

---

## 4. What signals are we watching

### Current state, stated plainly

**The 30 signals in the system today came from the workbook.** They were
curated by hand by Darwin and Adrian and imported.

**The automated feed is built and tested but not yet switched on.** The
connection to Fiber works, the parsing and scoring were validated end to end on
55 test signals, and the tracker list has not been created against the live
market. That is one command and it is the next step.

### What it will watch once switched on

Eleven rules, chosen because each one changes hiring timing:

| Signal | Why it matters |
| --- | --- |
| New funding round | money to hire with, over $1M |
| Funding stage changed | a new stage means a new plan |
| New investor | board change, often a hiring push |
| Company news | any article, for the timing |
| Headcount grew 15%+ | already hiring, may need help |
| Engineering team passed 20 | the team is scaling |
| Senior hire, VP or above | new leader, new team |
| Status changed | acquired or IPO |
| Made an acquisition | two org charts merging |
| New office | a location that needs staffing |
| Layoffs | candidate flow, not a client signal |

### What is deliberately ignored

Named rather than silently filtered, so "why did nothing fire" has an answer:

| Ignored | Why |
| --- | --- |
| Logo changed | cosmetic |
| Name changed | breaks matching, does not create an opening |
| Description changed | cosmetic |
| Follower growth | vanity, no hiring implication |
| Company posted | too noisy without a keyword filter |
| Technology added | not a hiring signal for this desk |
| Page went inactive | a suppression trigger, not an opportunity |

### Which companies are watched

The 961 working accounts, not all 3,045. Watching the Priority 3 tail would
spend the entity budget on rows nobody reads.

### What it costs

Listing rules and signals is **free**. Fiber only bills for job postings, which
is why open roles moved to Apify.

---

## Where each number comes from

| Number | Source | Ours? |
| --- | --- | --- |
| Priority, fit score | Master TAM | no, read only |
| Urgency and its six parts | computed here | yes |
| Open roles | Apify | fetched |
| Contacts to target | Prospeo | fetched |
| Warm network | LinkedIn export | already held |
| Signals | Fiber, once live | fetched |
| Work score and band | computed here | yes |
| The brief | OpenAI, grounded | generated, checked |

---

## Honest limits

- **The automated signal feed is not live yet.** Today's 30 signals are the
  hand curated ones from the workbook.
- **13 of the 25 Work now companies have no signal at all**, so their urgency
  is blank and they rank on fit and reach alone. That is correct behaviour, not
  a failure, but it means the board is currently ranking mostly on the master
  list.
- **Only Work now has open roles and contacts.** The other 936 have a website
  and a ranking, nothing more.
- **Three companies returned zero open roles** (PlanetiQ, Fortem, Censys).
  Unverified: either genuinely not hiring, or the scraper missed them.
- **483 of 843 contacts are unmatched** to any company.
- **The weights are a first pass.** They were chosen to be defensible, not
  because they have been validated against outcomes. Once there is a record of
  which approaches actually converted, they should be revisited.
