// Exa. Search built for machines, used here for one job: finding what has
// actually been written about a company recently.
//
// Docs: https://docs.exa.ai
//
// This is what separates a researched message from a generic one. Without it
// the writer only has what the database holds, which for most companies is a
// fit score and some job titles, and a message built from that says "I see you
// are growing" because there is nothing more specific to say.
//
// Everything it returns is a URL with a date and a snippet, so every claim in
// a drafted message can point at the thing it came from. That is what makes
// the grounding check possible: a sentence with no source behind it is a
// sentence the model invented.

const BASE = "https://api.exa.ai";

export class ExaError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "ExaError";
    this.status = status;
  }
}

export function exaAvailable() {
  return Boolean(process.env.EXA_API_KEY);
}

async function call(path, body) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new ExaError("EXA_API_KEY is not set");

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new ExaError(json?.error ?? `HTTP ${res.status}`, { status: res.status });
  }
  return json;
}

/**
 * Recent, substantive coverage of a company.
 *
 * `category: "news"` and a date floor rather than a plain web search, because
 * the company's own marketing pages always rank first and say nothing that
 * changes outreach timing. What is wanted is what a third party wrote, and
 * when.
 *
 * `text` is requested so the writer sees the actual sentences rather than a
 * headline. A headline is enough to know something happened; it is not enough
 * to say anything specific about it.
 */
export async function researchCompany(company, { domain, days = 180, limit = 6 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const res = await call("/search", {
    query: `${company} funding hiring expansion contract announcement`,
    type: "auto",
    category: "news",
    numResults: limit,
    startPublishedDate: since,
    // The company's own site is excluded: a press release is the company
    // describing itself, which the writer already has from the database.
    ...(domain ? { excludeDomains: [domain] } : {}),
    contents: { text: { maxCharacters: 1200 } },
  });
  return (res?.results ?? []).map(normalizeResult).filter((r) => r.text);
}

/**
 * What has been written about one person: interviews, quotes, posts.
 *
 * Scoped by company name as well as person name, because most names are not
 * unique and a message that references the wrong person's interview is worse
 * than one that references nothing.
 */
export async function researchPerson(name, company, { limit = 4 } = {}) {
  const res = await call("/search", {
    query: `"${name}" ${company} interview OR podcast OR announcement OR hiring`,
    type: "auto",
    numResults: limit,
    contents: { text: { maxCharacters: 900 } },
  });
  return (res?.results ?? []).map(normalizeResult).filter((r) => r.text);
}

function normalizeResult(r) {
  return {
    title: r.title ?? null,
    url: r.url ?? null,
    published: r.publishedDate ? String(r.publishedDate).slice(0, 10) : null,
    author: r.author ?? null,
    // Collapsed whitespace: scraped article text arrives full of newlines and
    // padding, which wastes context and makes the prompt harder to read when
    // something goes wrong and it has to be inspected by hand.
    text: (r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 1200) || null,
  };
}
