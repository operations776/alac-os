/**
 * Per-million-token rates, USD. The single source.
 *
 * Data law 7 in ARCHITECTURE.md: changing OPENAI_MODEL means changing this
 * table in the same commit, or agent_runs.cost_usd lies. A model that is not
 * in this table has no rate, and the cost helpers return null rather than
 * guessing. A null cost is an honest "we do not know"; a fabricated one is a
 * lie that compounds every run.
 *
 * This is a .mjs file with no `server-only` import so that BOTH sides can read
 * it: `pricing.ts` re-exports it for the app, and the node scripts import it
 * directly. It used to live in pricing.ts alone, which meant a script that
 * needed a rate had to keep its own copy, and two copies of a table that a
 * hard rule says must be updated in lockstep is the rule quietly failing.
 *
 * It contains no secrets and reads no environment, so there is nothing here
 * that must not reach a client bundle.
 */
export const MODEL_RATES = {
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export const DEFAULT_MODEL = "gpt-4.1-mini";
