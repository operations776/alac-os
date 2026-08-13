import 'server-only'

/**
 * Per-million-token rates, USD.
 *
 * Data law 7 in ARCHITECTURE.md: changing OPENAI_MODEL means changing this
 * table in the same commit, or agent_runs.cost_usd lies. A model that is not
 * in this table has no rate, and costUsd returns null rather than guessing.
 * A null cost is an honest "we do not know"; a fabricated one is a lie that
 * compounds every run.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

export const DEFAULT_MODEL = 'gpt-4.1-mini'

/** Null when the model has no published rate here. Never a guess. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const rate = MODEL_RATES[model]
  if (!rate) return null
  const usd =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  return Math.round(usd * 10_000) / 10_000
}

export function hasRate(model: string): boolean {
  return model in MODEL_RATES
}
