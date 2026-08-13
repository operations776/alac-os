/**
 * Confirms the reasoning layer is wired correctly: key present, model known,
 * rate published, and the API actually reachable with a forced schema.
 *
 *   node scripts/verify-ai.mjs
 *
 * Exits 0 when the pass is usable, and 0 with a clear DISABLED message when
 * there is no key. It only exits non-zero when something is genuinely broken,
 * so it is safe to run in CI where no key exists.
 */
import dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config({ path: '.env.local', quiet: true })

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MODEL_RATES = {
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const MODEL = process.env.OPENAI_MODEL || DEFAULT_MODEL
const key = process.env.OPENAI_API_KEY

console.log('')
console.log(`  model: ${MODEL}${process.env.OPENAI_MODEL ? '' : '  (default)'}`)

const rate = MODEL_RATES[MODEL]
if (!rate) {
  console.error(
    `\n  BROKEN: no rate for "${MODEL}" in pricing.ts. Add it in the same\n` +
      `  commit that changed OPENAI_MODEL, or agent_runs.cost_usd lies.\n`,
  )
  process.exit(1)
}
console.log(`  rate:  $${rate.input}/M in, $${rate.output}/M out`)

if (!key || key.length < 40) {
  console.log(
    `  key:   ${!key ? 'not set' : `placeholder (${key.length} chars)`}`,
  )
  console.log('')
  console.log('  Reasoning pass DISABLED. This is a supported state:')
  console.log('  deterministic scores still work, and the UI says the written')
  console.log('  read is unavailable rather than inventing it.')
  console.log('')
  process.exit(0)
}

console.log(`  key:   present (${key.slice(0, 7)}…, ${key.length} chars)`)
console.log('\n  calling the API with a forced schema…')

const openai = new OpenAI({ apiKey: key, maxRetries: 1 })

try {
  const res = await openai.responses.parse({
    model: MODEL,
    instructions: 'Reply with the single word ok.',
    input: 'Say ok.',
    text: {
      format: {
        type: 'json_schema',
        name: 'probe',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok'],
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
  })

  const inTok = res.usage?.input_tokens ?? 0
  const outTok = res.usage?.output_tokens ?? 0
  const usd =
    (inTok / 1_000_000) * rate.input + (outTok / 1_000_000) * rate.output

  console.log(`  reply: ${JSON.stringify(res.output_parsed)}`)
  console.log(`  usage: ${inTok} in, ${outTok} out  ($${usd.toFixed(6)})`)
  console.log('\n  Reasoning pass READY.\n')
  process.exit(0)
} catch (err) {
  console.error(`\n  BROKEN: ${err?.message ?? err}\n`)
  process.exit(1)
}
