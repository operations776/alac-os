# AI.md

Every model call in ALAC OS: what it does, what it costs, and the rules it obeys. If a call is not described here, it does not exist.

## 1. The governing principle

**The score is deterministic. The model explains the score. It never sets it.**

A pure TypeScript function scores every account 0 to 100 from stored fields. That runs over thousands of accounts in seconds, costs nothing, is reproducible, and works with no API key. The model is then asked one question: given this account, these dated signals, and this score breakdown, explain why this account deserves attention and why now.

If the model disagrees with the number, it says so in `risks` and `tier_opinion`. That disagreement becomes a recommendation for a human to resolve. It does not silently move the score. A user who catches the engine contradicting itself stops trusting all of it, so the arithmetic stays somewhere that cannot hallucinate.

## 2. Calls

### 2.1 `score_reasoning`

Runs after the deterministic pass, on the top 150 accounts plus any account with a pending recommendation. Not on all of them: the long tail does not earn the spend.

**Input, assembled in TypeScript and never free text from a user:** the account row, the full score breakdown, every `signals` row for that account with dates and ids, matched contacts with titles and connection dates, ALAC's positioning and ICP from config, the current quarter thesis, and the prior score with its delta.

**Output, forced to a JSON schema:**

```
reasoning         3 to 5 sentences, why this account deserves attention
why_now           1 to 2 sentences, why this week specifically
next_best_action  one concrete move, naming a person when one exists
risks             what would make this a waste of time
cited_signal_ids  array of signal ids the narrative rests on
confidence        0 to 1
tier_opinion      top25 | next25 | watch | removed | no_change
```

### 2.2 `draft_message`

One draft for one person, on demand. Models the operator's stated 10/80/10 split literally: his strategic input, the model's preparation, his final edit.

**Preparation fields, produced before the body is written:** `persona_read`, `company_context`, `signal_hook`, `relationship_note`, `positioning`. These are stored and shown beside the draft, because the reasoning is the product, not the prose.

Defaults to LinkedIn. Only 2.5 percent of the warm contact list has an email address, so email-first drafting would be unusable for most of the list.

### 2.3 `weekly_summary`

One call per weekly review, summarizing what changed across the portfolio since the last review. Reads score deltas and activity counts that were computed in SQL. It narrates numbers, it does not compute them.

## 3. The grounding rule

**Every id in `cited_signal_ids` must be an id that was supplied in that same request's input.** The response is validated in code before it is written. A response citing an unknown id is rejected, the item counts in `items_failed`, and nothing is stored for it.

This is enforced mechanically rather than asked for politely in the prompt, and it is what allows the decision card to render "why now" beside the dated signal it came from. Without it, "why now" is a plausible sentence with no provenance, which is worse than no sentence at all.

Related hard rules:

- **No key means disabled, not invented.** With `OPENAI_API_KEY` unset, deterministic scoring still runs and the reasoning panel states that the pass is disabled. It never fills the space with generated text.
- **A failed item is reported, not hidden.** A run of 150 that fails 12 reports 138 ok and 12 failed on the run page. No silent partial success.
- **Empty evidence fails.** A reasoning response with an empty `cited_signal_ids` is rejected. If there is nothing to cite, there is nothing to claim.

## 4. Run lifecycle

Claim before side effects, data law 3. The row exists before the money is spent.

```
open_agent_run(...)            -> run_id, status 'running'
  for each item, concurrency 5:
    call the model
    validate schema and cited ids
    attach_reasoning(...)      -> or count the item failed
close_agent_run(run_id, status, items_ok, items_failed, tokens, cost)
```

A crashed process leaves a row in `running`. `sweep_stalled_runs` closes anything older than 30 minutes as `failed`, which is the reconciliation sweep required by data law 6. Without it, a crash during a paid run leaves no record that money was spent.

Every `account_scores` row and every `message_drafts` row carries its `agent_run_id`, so any sentence in the UI can be traced to the run, model, and prompt version that produced it. The decision card footer shows exactly that and links to the run.

## 5. Models and rates

Rates live in `src/lib/server/ai/pricing.ts` and **nowhere else**. Changing `OPENAI_MODEL` means changing `MODEL_RATES` in the same commit, or `agent_runs.cost_usd` lies.

Prices are per million tokens.

| Purpose | Model | Input | Output |
| --- | --- | --- | --- |
| Reasoning pass, drafting | `gpt-5-6-terra` | 2.00 | 12.00 |
| Bulk classification, cheap passes | `gpt-5-6-luna` | 0.20 | 1.20 |
| Escalation, hard accounts only | `gpt-5-6-sol` | 5.00 | 30.00 |

Terra is the default: the reasoning pass is 150 short calls where quality matters and the flagship's premium does not buy proportionally better judgement on a bounded, evidence-grounded task.

**These rates were taken from public pricing pages and must be confirmed against the OpenAI dashboard before the first billed run.** Two sources disagreed on Terra's input rate (2.00 versus 2.50). A wrong rate here does not break the product, it makes the cost meter dishonest, which is worse. `npm run verify:ai` checks the key resolves and prints the active model and its rates for exactly this reason.

Cached input bills at roughly 10 percent of standard, and the Batch API at roughly 50 percent. Neither is used in the MVP. Batch is the obvious lever if the reasoning pass ever expands beyond the top 150.

## 6. Cost expectation

The reasoning pass at 150 accounts, roughly 2,500 input and 400 output tokens each, on Terra: about 0.375M input and 0.06M output, so roughly **$1.50 per full portfolio run**. A weekly cadence is a few dollars a month. This is not a system that needs a credit meter, but `agent_runs` records tokens and cost per run anyway, because "cheap" is a claim that should be checkable.
