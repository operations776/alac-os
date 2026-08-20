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
import { sender } from "../../../config/sender.mjs";

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
 * The house standard, quoted, plus the shape of the sender's own messages.
 *
 * The structure is taken from messages that actually earned replies rather
 * than invented. The order matters: the reason for making contact comes
 * first, the credential second because it earns the right to the subject, the
 * conviction third, and only then the observation and the question. Leading
 * with the observation is what makes a message read like a vendor who ran a
 * report.
 *
 * The closing question is the part most drafts get wrong. It is not an offer
 * of help and not a request for time. It is a question about their operation
 * that a person answers honestly, and the honest answer is the opening.
 */
const SYSTEM = [
  `You write the first outreach message for ${sender.name}, who runs ${sender.firm}, a recruiting firm for ${sender.focus}.`,
  "One message, to one person. It must be impossible to send to anyone else.",
  "",
  "THE SHAPE. Follow it in this exact order. Every one of the five parts must",
  "appear. Do not compress them, do not reorder them, do not drop the credential.",
  "Each part is its own short paragraph with a blank line between:",
  "1. WHY YOU ARE WRITING. If you were given a referral, name that person and what",
  "   they said. If there is no referral, use the single most specific thing that",
  "   just happened at their company: a funding round, a contract, a launch.",
  "   Never open with a general compliment about the company.",
  "   IMPORTANT: if the only fact you have is their open role count, do NOT use it",
  "   here. It belongs in part 4 and stating it twice reads like a form letter.",
  "   In that case open directly with part 2, who you are, and skip part 1.",
  `2. WHO YOU ARE. One sentence: ${sender.credential}, and that you co-founded ${sender.firm} ${sender.founded} recruiting for ${sender.focus}.`,
  `3. WHY THE FIRM EXISTS. State it as a conviction, not a service: ${sender.conviction}. Say it once, do not justify it.`,
  "4. THE OBSERVATION. One hard number from the facts you were given, stated once",
  "   and once only, as natural prose. \"Saw you are carrying 44 open roles across",
  "   12 sites.\" Never write it as a statistic or a restatement like \"the number",
  "   of open roles you have is 44\". If you already used this number in part 1,",
  "   do not repeat it here.",
  "5. THE QUESTION. One short open question about how their team is handling it.",
  "   It must be answerable honestly in one line. Never ask for a call, never offer",
  "   help, never say you can solve it.",
  "",
  "Good closing questions ask about their operation, not about your services:",
  "\"Curious, is your team covering all of it?\" or \"How are you splitting that",
  "between internal and agency?\"",
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
  "- Length. Too long is a failure on its own. Aim for 80 to 110 words.",
  "- Justification for every claim. Stating it once is more confident.",
  "- Over-explaining. Trust them to get it.",
  "- A hard call to action. No links, no calendars. Ask a question a human answers.",
  "- Superiority. Never write from above them.",
  "- Over-promising.",
  "- Apology in any disguise. Never sound sorry for making contact.",
  "- Consultant questions. Never ask how they 'balance' or 'navigate' or 'think",
  "  about' something. Ask a concrete question about their actual situation.",
  "",
  "STYLE:",
  "- Direct. Get to the point and give value while you do it.",
  "- Short sentences. Some very short. Vary the rhythm.",
  "- No em dashes. Use commas, colons, periods.",
  "- Straight quotes and straight apostrophes only. Never curly ones.",
  "- No emoji.",
  "- Start with the greeting on its own line, then a blank line.",
  "- Never open with 'I hope this finds you well', 'I came across', 'I noticed', or 'Quick question'.",
  "- Never use: leverage, synergy, unlock, reach out, circle back, touch base, exciting opportunity, game changer.",
  "",
  "GROUNDING, this is absolute:",
  "- Every fact you state must appear in the context block. Every number, date, role title and event.",
  "- If the context does not say it, you do not know it. Write around it.",
  "- Do not guess what they are struggling with. Reference what is actually written.",
  "- Do not invent a mutual connection, a shared background, or a previous conversation.",
  "- NEVER invent a referral. Only name a referrer if one is given to you explicitly.",
].join("\n");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "opening_line", "facts_used", "why_this_angle"],
  properties: {
    message: {
      type: "string",
      description:
        "The full message, greeting line first ('Hi <first name>,'), then a blank line, then the five parts as separate short paragraphs. 80 to 110 words.",
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
function buildContext({
  company, person, signals, roles, research, personResearch, warmContacts,
  referral, roleStats,
}) {
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

  // The referral is the strongest possible opening and the most dangerous
  // thing to get wrong, so it is only ever stated when one was passed in.
  // Nothing here infers it: a fabricated "X spoke highly of you" is the one
  // mistake that would cost the sender the relationship as well as the reply.
  if (referral) {
    L.push("\nYOUR REFERRAL INTO THIS COMPANY:");
    L.push(`  ${referral}`);
    L.push("  Open with this. Name them and say what they said.");
  } else {
    L.push("\nREFERRAL: none. You have no mutual contact to name, so do not name one.");
  }

  L.push("\nWHAT JUST HAPPENED THERE:");
  if (signals.length === 0) L.push("  Nothing recorded.");
  for (const s of signals) {
    L.push(`  ${s.signal_date ?? "undated"}: ${s.what_happened}${s.the_number ? ` (${s.the_number})` : ""}`);
  }

  // The observation line is a computed number, not a list to count. The stats
  // come from a count over every qualified role, while the titles below are a
  // truncated sample: a model told to count the sample would say "12 roles"
  // for a company with 44, which is the kind of error the reader notices.
  L.push("\nROLES THEY HAVE OPEN:");
  if (!roleStats || roleStats.total === 0) {
    L.push("  None found. Do not claim they are hiring.");
  } else {
    let line = `  THE NUMBER TO USE: ${roleStats.total} open roles`;
    if (roleStats.sites > 1) line += ` across ${roleStats.sites} locations`;
    if (roleStats.functions > 1) line += `, spanning ${roleStats.functions} functions`;
    L.push(line);
    if (roleStats.locations?.length > 1) {
      L.push(`  Locations: ${roleStats.locations.slice(0, 8).join(", ")}`);
    }
    if (roles.length > 0) {
      L.push(`  A sample of the titles, not the full list:`);
      for (const r of roles.slice(0, 12)) {
        L.push(`    ${r.title}${r.location ? `, ${r.location}` : ""}`);
      }
    }
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
  // Every inflection: the model writes "reaching out" when told not to
  // write "reach out", and the phrase is the thing being banned rather than
  // the exact tense.
  "reach out",
  "reaching out",
  "reached out",
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
 * The consultant question: the failure mode that survives every other check.
 *
 * "How are you balancing speed with quality" is grounded, polite, correctly
 * punctuated and inside the word limit, and it is the reason a message gets
 * ignored. It asks the reader to do unpaid strategy work for a stranger.
 * A good question asks about their actual situation instead.
 */
const CONSULTANT = [
  /how (are|do) you (balanc|navigat|approach|think about|see)/i,
  /what'?s your (approach|philosophy|thinking) (to|on|about)/i,
  /how do you (view|frame)/i,
  /curious how you'?re thinking about/i,
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
  // Only ever a real, recorded referral. Nothing infers one, because a
  // fabricated "X spoke highly of you" is the single worst thing this could
  // send.
  referral = null,
  // Counted over every qualified role, not over the truncated sample.
  roleStats = null,
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
    referral, roleStats,
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

  // The same figure twice reads as a form letter. Checked on numbers of two
  // digits or more, so a year or a stray "5" in a title does not trip it.
  const figures = body.match(/\b\d{2,}\b/g) ?? [];
  const repeated = figures.find((n, i) => figures.indexOf(n) !== i);
  if (repeated) {
    return `it stated the number ${repeated} more than once. Say it a single time, in one place`;
  }

  const consultant = CONSULTANT.find((re) => re.test(body));
  if (consultant) {
    return "it closed with a consultant question, the kind that asks the reader to explain their strategy to a stranger. Ask something concrete about their actual situation instead";
  }

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

  // The credential is the line that earns the right to the subject, and it is
  // the one the model drops first when it decides to be concise. Checked on a
  // distinctive token rather than the whole string, because paraphrase is fine
  // and omission is not.
  const marker = sender.credential.split(/s+/).find((w) => w.length > 5);
  if (marker && !lower.includes(marker.toLowerCase())) {
    return `it left out the credential. The message has to say who the sender is, including "${sender.credential}"`;
  }
  return null;
}

// Exported for scripts/test-outreach.mjs only. The gate is the part worth
// testing and it has no network in it.
export { checkDraft as __checkDraft };
