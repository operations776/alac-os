import 'server-only'

/**
 * Re-exported from rates.mjs, which is the single source.
 *
 * The table lives in a .mjs file with no server-only import because the node
 * scripts need it too, and a second copy of a table that data law 7 says must
 * change in lockstep is that law quietly failing. This module keeps the
 * server-only boundary for the app side.
 */
import { MODEL_RATES as RATES, DEFAULT_MODEL } from './rates.mjs'

// The .mjs table is a plain object literal, so TypeScript infers exact keys
// rather than an index signature. Restating the type at this boundary is what
// keeps costUsd(model: string) callable without an any.
export const MODEL_RATES: Record<string, { input: number; output: number }> = RATES
export { DEFAULT_MODEL }


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
