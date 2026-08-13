import 'server-only'
import OpenAI from 'openai'
import { DEFAULT_MODEL, hasRate } from './pricing'

/**
 * The reasoning layer is optional by design. ARCHITECTURE.md section 8: with
 * no key the deterministic scores still work, the reasoning pass is disabled,
 * and the UI says so rather than inventing text.
 *
 * A placeholder value counts as absent. A 9-character string that begins with
 * sk- is not a key, and treating it as one produces a 401 halfway through a
 * run instead of a clear refusal at the start.
 */
export function reasoningStatus(): {
  available: boolean
  reason: string | null
  model: string
} {
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL
  const key = process.env.OPENAI_API_KEY

  if (!key) {
    return { available: false, reason: 'OPENAI_API_KEY is not set', model }
  }
  if (key.length < 40) {
    return {
      available: false,
      reason: `OPENAI_API_KEY looks like a placeholder (${key.length} chars)`,
      model,
    }
  }
  if (!hasRate(model)) {
    return {
      available: false,
      reason: `no cost rate for model "${model}" in pricing.ts (data law 7)`,
      model,
    }
  }
  return { available: true, reason: null, model }
}

let client: OpenAI | null = null

export function openai(): OpenAI {
  const status = reasoningStatus()
  if (!status.available) {
    throw new Error(`Reasoning pass unavailable: ${status.reason}`)
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 })
  }
  return client
}
