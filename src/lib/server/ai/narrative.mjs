// The narrative pass: why now, who to contact first, what to do, what the risk
// is.
//
// This is the one place the product generates prose, so it is the one place a
// hallucination could reach Adrian. Three rules hold it in place, and all three
// are enforced in code rather than asked for in the prompt:
//
//   1. A forced JSON schema. The model returns four named fields or the call
//      fails. It cannot answer "who to contact first" with a paragraph.
//   2. Grounding. `contact_first` must name a person who was actually supplied.
//      A name the model invented is rejected and the whole narrative is dropped.
//   3. No key, no prose. Missing credentials produce a stated absence, never a
//      guess. CLAUDE.md: the reasoning panel says so, it does not invent.
//
// A rejected narrative is not an error to retry. It is a model that made
// something up, and the deterministic score plus the evidence still stand on
// their own without it.

import OpenAI from "openai";
import { MODEL_RATES, DEFAULT_MODEL } from "./rates.mjs";

/**
 * The same availability rule as `openai.ts`, restated here because that module
 * is `server-only` and TypeScript: a plain node script cannot import it.
 *
 * The rate table is NOT restated. It lives in rates.mjs and `pricing.ts`
 * re-exports it, so there is exactly one place a model price is written. The
 * hard rule is that changing OPENAI_MODEL means changing the rates in the same
 * commit, and two copies of the table would make that rule unenforceable.
 */
function reasoningStatus() {
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { available: false, reason: "OPENAI_API_KEY is not set", model };
  if (key.length < 40) {
    return { available: false, reason: `OPENAI_API_KEY looks like a placeholder (${key.length} chars)`, model };
  }
  if (!MODEL_RATES[model]) {
    return { available: false, reason: `no cost rate for model "${model}" in rates.mjs`, model };
  }
  return { available: true, reason: null, model };
}

function costUsd(model, inputTokens, outputTokens) {
  const rate = MODEL_RATES[model];
  if (!rate) return null;
  const usd = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * 10_000) / 10_000;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["why_now", "contact_first", "next_step", "risks"],
  properties: {
    why_now: {
      type: "string",
      description:
        "Two sentences at most. Why this account is worth a call this week, referring only to the signals and open roles supplied.",
    },
    contact_first: {
      type: "string",
      description:
        "The exact full name of ONE person from the supplied contacts, followed by a comma and a short reason. Never a name that was not supplied.",
    },
    next_step: {
      type: "string",
      description: "One concrete verb-led action, e.g. 'Build the battlecard' or 'Send a connection request to X'.",
    },
    risks: {
      type: "string",
      description: "One sentence on what would make this a waste of time. Empty string if nothing stands out.",
    },
  },
};

/**
 * Everything the model is allowed to know, rendered as text.
 *
 * Deliberately narrow. The model sees the signals, the qualified roles, the
 * ranked contacts and the warm network, and nothing else: no free text from
 * the internet and no memory of other accounts. Whatever it writes has to come
 * from this block, which is what makes the grounding check meaningful.
 */
function buildContext({ company, priority, finalScore, signals, roles, targets, warm }) {
  const lines = [];
  lines.push(`COMPANY: ${company}`);
  lines.push(`TAM priority: ${priority ?? "not scored"}, final score: ${finalScore ?? "none"}`);

  lines.push("\nSIGNALS (what changed):");
  if (signals.length === 0) lines.push("  none recorded");
  for (const s of signals.slice(0, 6)) {
    lines.push(`  [${s.signal_date ?? "undated"}] ${s.what_happened}${s.the_number ? ` (${s.the_number})` : ""}`);
    if (s.primary_source) lines.push(`    source: ${s.primary_source}`);
  }

  lines.push("\nOPEN ROLES (ALAC qualified):");
  if (roles.length === 0) lines.push("  none found");
  for (const r of roles.slice(0, 15)) {
    lines.push(`  ${r.title}${r.location ? ` — ${r.location}` : ""}${r.posted_at ? `, posted ${r.posted_at}` : ""}`);
  }

  lines.push("\nCONTACTS YOU MAY NAME (no others exist):");
  for (const t of targets) {
    lines.push(`  ${t.full_name} — ${t.title ?? "title unknown"}${t.isWarm ? " [ALREADY A FIRST DEGREE CONNECTION]" : ""}`);
  }
  if (warm.length > 0) {
    lines.push("\nWARM NETWORK (first degree, no introduction needed):");
    for (const w of warm.slice(0, 15)) {
      lines.push(`  ${w.full_name} — ${w.title ?? "title unknown"}${w.is_decision_maker ? " [decision maker]" : ""}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM = [
  "You brief a recruiting firm's founder before he contacts a company.",
  "He has five minutes and needs to know why this account, why now, and who to call.",
  "",
  "Rules you must follow:",
  "- Use ONLY the facts in the context block. Never add a fact, a number, a date or a name that is not there.",
  "- contact_first must be the exact full name of one person from the CONTACTS or WARM NETWORK lists.",
  "- Prefer someone already a first degree connection: no introduction is needed.",
  "- Prefer whoever owns the requisition (talent acquisition) or the team hiring.",
  "- Be specific and plain. No marketing language, no adjectives that carry no information.",
  "- Do not use em dashes.",
].join("\n");

/**
 * Every name the model is permitted to use, normalized for comparison.
 * Comparison is on a lowercased, punctuation stripped form so that "Meg Read"
 * matches "meg read" but an invented name still fails.
 */
function allowedNames(targets, warm) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const set = new Set();
  for (const t of targets) if (t.full_name) set.add(norm(t.full_name));
  for (const w of warm) if (w.full_name) set.add(norm(w.full_name));
  return { set, norm };
}

/**
 * Generate the narrative, or explain why there is none.
 *
 * Returns { narrative, cost, model, rejected }. `narrative` is null whenever
 * the pass did not produce something trustworthy, and `rejected` says which
 * rule it broke.
 */
export async function writeNarrative(input) {
  const status = reasoningStatus();
  if (!status.available) {
    return { narrative: null, cost: 0, model: null, rejected: status.reason };
  }
  const MODEL = status.model;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });

  const context = buildContext(input);
  const { set: allowed, norm } = allowedNames(input.targets ?? [], input.warm ?? []);

  if (allowed.size === 0) {
    // Nobody to name means the question "who do I contact first" has no honest
    // answer, so it is not asked.
    return { narrative: null, cost: 0, model: null, rejected: "no contacts supplied" };
  }

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "account_brief", schema: SCHEMA, strict: true },
    },
    temperature: 0.2,
  });

  const usage = res.usage ?? {};
  const cost = costUsd(MODEL, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0) ?? 0;
  const raw = res.choices?.[0]?.message?.content;
  if (!raw) return { narrative: null, cost, model: MODEL, rejected: "empty response" };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { narrative: null, cost, model: MODEL, rejected: "unparseable json" };
  }

  // The grounding check. contact_first has to start with a name we supplied.
  // The model is told to write "Name, reason", so the name is matched as a
  // prefix rather than by requiring an exact whole-string match.
  const claimed = norm(String(parsed.contact_first ?? "").split(",")[0]);
  const grounded = claimed && [...allowed].some((n) => claimed === n || claimed.startsWith(n) || n.startsWith(claimed));

  if (!grounded) {
    // A fabricated contact is exactly the failure this check exists for, so it
    // takes the whole narrative down rather than being quietly trimmed.
    return {
      narrative: null,
      cost,
      model: MODEL,
      rejected: `contact_first "${parsed.contact_first}" names nobody who was supplied`,
    };
  }

  return { narrative: parsed, cost, model: MODEL, rejected: null };
}
