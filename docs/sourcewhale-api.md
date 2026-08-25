# SourceWhale API, what it can and cannot do

Verified against the live spec at `https://sourcewhale.app/public-api/swagger`,
which serves an OpenAPI 3.0.1 document titled `public-api`, version 1.0.

Worth recording because the marketing site does not mention an API anywhere:
not on the homepage, not on the integrations page listing 105 integrations, and
not in the help centre. Searching those alone would say no API exists. It does.

## Basics

- Base URL: `https://sourcewhale.app/public-api`
- Auth: an API key in an `api-key` request header
- There are published API terms, so this is a supported product surface rather
  than an internal endpoint

## Endpoints

| Method | Path | Use to us |
| --- | --- | --- |
| GET | `/v1/campaigns/list` | Campaigns, with an `includeMetrics` flag. The main read |
| GET | `/v1/candidates/search` | Look up a person by key and value, for example email |
| GET | `/v1/projects/list` | Projects |
| GET | `/v1/statistics/dashboard` | Activity totals between a `from` and `to` date |
| POST | `/v1/candidates/add` | Add people to a campaign. **We never call this** |
| POST | `/v1/candidates/modify` | Modify a candidate. **We never call this** |
| POST | `/v1/zapier/subscribe` | Webhook subscription, Zapier shaped |

The two POST endpoints that write are deliberately out of scope: SourceWhale is
the execution layer and stays the system of record. Reads only.

## What this makes possible

- Show which campaign a company is in, on the company record
- Check whether a person is already in a sequence before anyone loads them again
- Pull weekly activity totals so the scorecard stops being typed by hand

## What it does not give us

- **No per opportunity feed.** `statistics/dashboard` reports totals across a
  date range, not a record per opportunity. Attribution beyond that has to be
  assembled on our side from the accounts and signals we already hold.
- **No response schemas.** The spec declares parameters but not response bodies,
  so exact field names are unknown until called with a real key. Read the live
  response before writing any parser, the same rule that already applies to
  Fiber.
- **A webhook exists but is Zapier shaped.** `zapier/subscribe` takes a URL and
  a subscription type. Whether it can be pointed at an arbitrary endpoint is
  untested.

## Before building

1. An API key from ALAC's SourceWhale account.
2. One call each to `campaigns/list` and `statistics/dashboard`, saved as
   fixtures, so the parser is written against real payloads rather than guesses.
