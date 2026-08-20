// The researched first message.
//
// Not a mail merge. One message, to one person, that could not have been sent
// to anybody else, built from what actually happened at their company and what
// they are actually hiring for.
//
// The copy standard is Daniyal's, quoted from the outbound copywriting
// reference rather than paraphrased, because a paraphrase of a writing rule is
// a different writing rule.
//
// Everything the model may say comes from a context block assembled here. It
// sees the signal, the open roles, the research, the person, and nothing else.
// Then every factual claim it makes is checked against that block, and a
// message that references something absent is rejected rather than sent.

import OpenAI from "openai";
import { MODEL_RATES, DEFAULT_MODEL } from "./rates.mjs";
import { researchCompany, researchPerson, exaAvailable } from "../integrations/exa.mjs";

function reasoningStatus() {
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { available: false, reason: "OPENAI_API_KEY is not set", model };
  if (key.length < 40) return { available: false, reason: "OPENAI_API_KEY looks like a placeholder", model };
  if (!MODEL_RATES[model]) return { available: false, reason: `no rate for "${model}"`, model };
  return { available: true, reason: null, model };
}

function costUsd(model, inTok, outTok) {
  const rate = MODEL_RATES[model];
  if (!rate) return 0;
  return Math.round(((inTok / 1e6) * rate.input + (outTok / 1e6) * rate.output) * 10_000) / 10_000;
}

/**
 * The house standard, quoted.
 *
 * The "must not have" list is longer than the "must have" list on purpose:
 * most outbound fails by including something rather than by omitting it.
 */
const SYSTEM = [
  "You write the first outreach message for the founder of a defense and deep-tech recruiting firm.",
  "One message, to one person. It must be impossible to send to anyone else.",
  "",
  "MUST HAVE:",
  "- Value. Something useful to them whether or not they reply.",
  "- Conversational. How you would talk to someone sitting in front of you.",
  "- Friendly. Warm, not neutral or clinical.",
  "- Personal. Their role, their company, something specific and real.",
  "- The unspoken thing. Name what is on their mind that they are not saying.",
  "",
  "MUST NOT HAVE:",
  "- Anything salesy. If it reads like a sales team wrote it, rewrite it.",
  "- Length. Too long is a failure on its own. Aim under 90 words.",
  "- Justification for every claim. Stating it once is more confident.",
  "- Over-explaining. Trust them to get it.",
  "- A hard call to action. No links, no calendars. Ask a question a human answers.",
  "- Superiority. Never write from above them.",
  "- Over-promising.",
  "- Apology in any disguise. Never sound sorry for making contact.",
  "",
  "STYLE:",
  "- Direct. Get to the point and give value while you do it.",
  "- Short sentences. Some very short. Vary the rhythm.",
  "- No em dashes. Use commas, colons, periods.",
  "- Straight quotes and straight apostrophes only. Never curly ones.",
  "- No emoji.",
  "- Never open with 'I hope this finds you well', 'I came across', 'I noticed', or 'Quick question'.",
  "- Never use: leverage, synergy, unlock, reach out, circle back, touch base, exciting opportunity, game changer.",
  "",
  "GROUNDING, this is absolute:",
  "- Every fact you state must appear in the context block. Every number, date, role title and event.",
  "- If the context does not say it, you do not know it. Write around it.",
  "- Do not guess what they are struggling with. Reference what is actually written.",
  "- Do not invent a mutual connection, a shared background, or a previous conversation.",
].join("\n");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "opening_line", "facts_used", "why_this_angle"],
  properties: {
    message: {
      type: "string",
      description:
        "The full message. Under 90 words. No greeting line like 'Hi X,' is needed, start with the substance.",
    },
    opening_line: {
      type: "string",
      description: "The first sentence on its own, so it can be judged at a glance.",
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description:
        "Each specific fact referenced in the message, quoted from the context block. One per item.",
    },
    why_this_angle: {
      type: "string",
      description: "One sentence for the sender: why this angle rather than another.",
    },
  },
};

/**
 * The context block. Everything the writer may use, and nothing else.
 *
 * Assembled here rather than in the prompt template so the grounding check can
 * be run against the same text the model was shown. Checking against a
 * different string than the one the model saw would prove nothing.
 */
function buildContext({ company, person, signals, roles, research, personResearch, warmContacts }) {
  const L = [];
  L.push(`COMPANY: ${company.name}`);
  if (company.domain) L.push(`Website: ${company.domain}`);
  if (company.employees) L.push(`Headcount: ${company.employees}`);

  L.push(`\nPERSON: ${person.full_name}`);
  L.push(`Their role: ${person.title ?? "not recorded"}`);
  if (person.is_warm) {
    L.push("They are ALREADY a first degree connection. You have met or are connected.");
  } else {
    L.push("You are NOT connected to them. This is a cold first message.");
  }

  L.push("\nWHAT JUST HAPPENED THERE:");
  if (signals.length === 0) L.push("  Nothing recorded.");
  for (const s of signals) {
    L.push(`  ${s.signal_date ?? "undated"}: ${s.what_happened}${s.the_number ? ` (${s.the_number})` : ""}`);
  }

  L.push("\nROLES THEY HAVE OPEN:");
  if (roles.length === 0) L.push("  None found.");
  for (const r of roles.slice(0, 12)) {
    L.push(`  ${r.title}${r.location ? `, ${r.location}` : ""}${r.posted_at ? `, posted ${r.posted_at}` : ""}`);
  }

  if (research.length > 0) {
    L.push("\nWRITTEN ABOUT THE COMPANY RECENTLY:");
    for (const a of research) {
      L.push(`  [${a.published ?? "undated"}] ${a.title}`);
      L.push(`    ${a.text.slice(0, 500)}`);
    }
  }

  if (personResearch.length > 0) {
    L.push(`\nWRITTEN ABOUT ${person.full_name}:`);
    for (const a of personResearch) {
      L.push(`  [${a.published ?? "undated"}] ${a.title}`);
      L.push(`    ${a.text.slice(0, 400)}`);
    }
  }

  if (warmContacts.length > 0) {
    L.push("\nPEOPLE YOU ALREADY KNOW THERE:");
    for (const w of warmContacts.slice(0, 6)) {
      L.push(`  ${w.full_name}, ${w.title ?? "role unknown"}`);
    }
    L.push("  You may mention knowing them ONLY if it is natural. Never claim they referred you.");
  }

  return L.join("\n");
}

/**
 * Phrases that mean the draft failed the standard regardless of what else it
 * got right. Checked in code because a model asked not to use a phrase will
 * still reach for it when the rest of the prompt is hard.
 */
const BANNED = [
  "i hope this finds you well",
  "i came across",
  "i noticed",
  "quick question",
  "reach out",
  "circle back",
  "touch base",
  "leverage",
  "synergy",
  "unlock",
  "exciting opportunity",
  "game changer",
  "just wanted to",
  "sorry to bother",
  "apologies for",
];

/**
 * Write one message.
 *
 * Returns { message, cost, model, rejected, research }. `message` is null
 * whenever the draft failed a check, and `rejected` says which one, because a
 * silent fallback to a generic message is the exact failure this is built to
 * avoid.
 */
export async function writeFirstMessage({
  company,
  person,
  signals = [],
  roles = [],
  warmContacts = [],
}) {
  const status = reasoningStatus();
  if (!status.available) {
    return { message: null, cost: 0, model: null, rejected: status.reason, research: [] };
  }

  // Research first. Without it the message can only reference the database,
  // and the whole point is that it references the world.
  let research = [];
  let personResearch = [];
  let researchNote = null;
  if (exaAvailable()) {
    try {
      [research, personResearch] = await Promise.all([
        researchCompany(company.name, { domain: company.domain }),
        researchPerson(person.full_name, company.name),
      ]);
    } catch (err) {
      researchNote = `research unavailable: ${String(err.message).slice(0, 120)}`;
    }
  } else {
    researchNote = "EXA_API_KEY is not set, so the message can only use stored facts";
  }

  const context = buildContext({
    company, person, signals, roles, research, personResearch, warmContacts,
  });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });
  const haystack = context.toLowerCase();
  let cost = 0;
  let lastFault = null;

  // Two attempts. The first rejection is usually a habit rather than a
  // misunderstanding, "I noticed" being the common one, and naming the exact
  // fault fixes it. A third attempt does not help: if it fails twice the draft
  // is genuinely wrong and shipping it would be worse than shipping nothing.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ];
    if (lastFault) {
      messages.push({
        role: "user",
        content: `Your last draft was rejected: ${lastFault}. Write it again and fix exactly that. Keep everything else.`,
      });
    }

    const res = await client.chat.completions.create({
      model: status.model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "first_message", schema: SCHEMA, strict: true },
      },
      // Low but not zero. At zero every message for similar companies converges
      // on the same sentence, which is the opposite of the goal. The retry
      // lifts it slightly to break out of the phrasing that just failed.
      temperature: attempt === 0 ? 0.4 : 0.6,
    });

    const usage = res.usage ?? {};
    cost += costUsd(status.model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);

    const raw = res.choices?.[0]?.message?.content;
    if (!raw) {
      lastFault = "empty response";
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastFault = "unparseable json";
      continue;
    }

    const fault = checkDraft(parsed, haystack);
    if (fault) {
      lastFault = fault;
      continue;
    }

    return {
      message: parsed,
      cost,
      model: status.model,
      rejected: null,
      attempts: attempt + 1,
      research,
      researchNote,
      sources: [...research, ...personResearch].map((r) => r.url).filter(Boolean),
    };
  }

  return { message: null, cost, model: status.model, rejected: lastFault, attempts: 2, research };
}

/**
 * Every reason a draft is not good enough, in one place.
 *
 * Returns the fault as a sentence, or null when the draft passes. The sentence
 * is fed straight back to the model on retry, so it has to name the specific
 * thing that went wrong rather than just failing.
 */
/**
 * Curly punctuation, flattened.
 *
 * The model produces typographic quotes no matter what the prompt says, and
 * they survive into LinkedIn's composer as mojibake on some clients. Rewriting
 * is better than rejecting: the draft is otherwise fine and the fix is
 * mechanical.
 */
function flattenQuotes(s) {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–‒]/g, "-");
}

function checkDraft(parsed, haystack) {
  parsed.message = flattenQuotes(String(parsed.message ?? ""));
  parsed.opening_line = flattenQuotes(String(parsed.opening_line ?? ""));
  const body = String(parsed.message ?? "");
  const lower = body.toLowerCase();

  const hit = BANNED.find((b) => lower.includes(b));
  if (hit) return `it used the banned phrase "${hit}"`;

  if (body.includes("—")) return "it used an em dash, which the house style forbids";

  const words = body.trim().split(/\s+/).length;
  if (words > 130) return `it was ${words} words, and the limit is 130`;

  // The check that matters most: a confident, specific, entirely invented
  // detail. Compared on distinctive words rather than exact substrings,
  // because the model paraphrases and an exact match would reject good drafts.
  const unsupported = (parsed.facts_used ?? []).filter((f) => {
    const claim = String(f).toLowerCase();
    const w = claim.split(/\W+/).filter((x) => x.length > 4);
    if (w.length === 0) return false;
    return w.filter((x) => haystack.includes(x)).length / w.length < 0.6;
  });
  if (unsupported.length > 0) {
    return `it claimed "${unsupported[0]}", which is not in the research you were given`;
  }

  return null;
}

// Exported for scripts/test-outreach.mjs only. The gate is the part worth
// testing and it has no network in it.
export { checkDraft as __checkDraft };
