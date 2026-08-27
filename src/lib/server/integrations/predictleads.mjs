// PredictLeads. The signal feed.
//
// Replaces Fiber. The reason is coverage rather than price: Fiber's tracker
// had to be told which companies to watch and then waited for something to
// happen, and it was never switched on. PredictLeads is asked about a company
// by domain and answers immediately with everything it already knows, which
// means the desk has signals on day one rather than after a watch period.
//
// Docs: https://predictleads.com/docs
//
// Verified live against the account before this file was written. What follows
// is what the API actually returned, not what the documentation implies.
//
// Auth is two headers, a key and a token, both required. A request missing
// either is a 401 with no useful body.

const BASE = "https://predictleads.com/api/v3";

export class PredictLeadsError extends Error {
  constructor(message, { status, endpoint } = {}) {
    super(message);
    this.name = "PredictLeadsError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

/** Strip credentials out of anything that might be logged. */
function redact(text, ...secrets) {
  let out = String(text ?? "");
  for (const s of secrets) {
    if (s) out = out.split(s).join("[redacted]");
  }
  return out;
}

export function predictLeadsAvailable() {
  return Boolean(process.env.PREDICTLEADS_API_KEY && process.env.PREDICTLEADS_API_TOKEN);
}

async function call(endpoint, { limit = 100, page } = {}) {
  const key = process.env.PREDICTLEADS_API_KEY;
  const token = process.env.PREDICTLEADS_API_TOKEN;
  if (!key || !token) {
    throw new PredictLeadsError("PREDICTLEADS_API_KEY and PREDICTLEADS_API_TOKEN must both be set");
  }

  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set("limit", String(limit));
  if (page) url.searchParams.set("page", String(page));

  const res = await fetch(url, {
    headers: { "X-Api-Key": key, "X-Api-Token": token, accept: "application/json" },
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }

  if (!res.ok) {
    // 404 means "no record for this domain", which is an ordinary answer for a
    // small company rather than a failure. The caller decides.
    throw new PredictLeadsError(
      redact(json?.message ?? json?.error ?? `HTTP ${res.status}`, key, token),
      { status: res.status, endpoint },
    );
  }
  return json;
}

/**
 * The categories worth waking somebody up for, and what each is worth.
 *
 * Weight is the hiring urgency contribution, out of 30, before recency decay.
 * These are ordered by how directly the event implies a company is about to
 * need people, which is the only question this desk asks.
 *
 * `leaves` is here and was not available from Fiber at all. A named director
 * leaving is a backfill that has to happen, and it is public before the
 * replacement requisition is.
 */
export const CATEGORY_WEIGHT = {
  receives_financing: 30,
  increases_headcount_by: 28,
  hires: 24,
  expands_offices_to: 22,
  expands_offices_in: 20,
  expands_facilities: 20,
  leaves: 18,
  acquires: 16,
  signs_new_client: 14,
  launches: 12,
  has_valuation: 10,
  invests_into: 8,
  partners_with: 6,
  closes_offices_in: 4,
};

/** Categories we store. Anything else is noise for a recruiting desk. */
export const TRACKED = Object.keys(CATEGORY_WEIGHT);

/**
 * Everything PredictLeads knows about a company, newest first.
 *
 * Returns normalized rows with the source article attached, because a signal
 * the operator cannot click through to is a signal they have to take on faith.
 */
export async function companySignals(domain, { limit = 100, since } = {}) {
  const json = await call(`/companies/${encodeURIComponent(domain)}/news_events`, { limit });

  // Articles arrive alongside the events rather than inside them, keyed by id.
  const articles = new Map();
  for (const inc of json.included ?? []) {
    if (inc.type === "news_article") articles.set(inc.id, inc.attributes ?? {});
  }

  const floor = since ? new Date(since).getTime() : null;
  const out = [];

  for (const row of json.data ?? []) {
    const a = row.attributes ?? {};
    if (!TRACKED.includes(a.category)) continue;

    // effective_date is when it happened, found_at is when PredictLeads saw
    // it. The first is the truth and the second is the fallback: an event
    // dated by discovery would make an old round look like this week's news.
    const dated = a.effective_date ?? a.found_at ?? null;
    if (floor && dated && new Date(dated).getTime() < floor) continue;

    const artId = row.relationships?.most_relevant_source?.data?.id;
    const art = artId ? articles.get(artId) : null;

    out.push({
      external_id: row.id,
      category: a.category,
      summary: (a.summary ?? a.article_sentence ?? "").replace(/\s+/g, " ").trim() || null,
      signal_date: dated ? String(dated).slice(0, 10) : null,
      confidence: typeof a.confidence === "number" ? a.confidence : null,
      amount: a.amount_normalized ?? null,
      headcount: a.headcount ?? null,
      financing_type: a.financing_type_normalized ?? a.financing_type ?? null,
      job_title: a.job_title ?? null,
      contact: a.contact ?? null,
      location: a.location ?? null,
      product: a.product ?? null,
      source_url: art?.url ?? null,
      source_title: art?.title ?? null,
      source_published: art?.published_at ? String(art.published_at).slice(0, 10) : null,
    });
  }

  // Newest first, undated last. An undated signal cannot argue for timing.
  out.sort((x, y) => (y.signal_date ?? "").localeCompare(x.signal_date ?? ""));
  return out;
}

/**
 * A human sentence for a signal, used where the raw summary is thin.
 *
 * Built from the structured fields rather than from the model, so it is free
 * and cannot invent anything.
 */
export function describeSignal(s) {
  if (s.summary) return s.summary;
  const money = s.amount ? ` of $${Number(s.amount).toLocaleString()}` : "";
  switch (s.category) {
    case "receives_financing":
      return `Raised${money}${s.financing_type ? ` in a ${s.financing_type} round` : ""}.`;
    case "increases_headcount_by":
      return `Headcount grew${s.headcount ? ` by ${s.headcount}` : ""}.`;
    case "hires":
      return `Hired ${s.contact ?? "someone"}${s.job_title ? ` as ${s.job_title}` : ""}.`;
    case "leaves":
      return `${s.contact ?? "Someone"} left${s.job_title ? `, ${s.job_title}` : ""}.`;
    case "expands_offices_to":
    case "expands_offices_in":
      return `Opened an office${s.location ? ` in ${s.location}` : ""}.`;
    default:
      return s.category.replace(/_/g, " ");
  }
}

/**
 * Open roles, straight from PredictLeads.
 *
 * Verified live: `first_seen_at` and `last_seen_at` are timestamps to the
 * minute and were the current day on the first call, so "posted today" is a
 * real question this can answer. `posted_at` is null on every row seen, which
 * is why first_seen is the date used: it is when the posting entered the feed,
 * which is the closest honest proxy for when it went up.
 *
 * The url is the employer's own board, usually Greenhouse or Lever, so a role
 * on the screen is one click from the live posting rather than from a search.
 */
export async function companyJobs(domain, { limit = 100 } = {}) {
  const json = await call(`/companies/${encodeURIComponent(domain)}/job_openings`, { limit });
  return (json.data ?? []).map((row) => {
    const a = row.attributes ?? {};
    const loc = Array.isArray(a.location_data) ? a.location_data[0] : null;
    return {
      external_id: row.id,
      title: a.title ?? a.normalized_title ?? null,
      // The raw location string is a full geographic path, "Seattle,
      // Washington, United States, Northern America, Americas", which is
      // unreadable in a list. The structured form gives back a city.
      location: loc?.city
        ? [loc.city, loc.state ?? loc.country].filter(Boolean).join(", ")
        : (a.location ?? null),
      url: a.url ?? null,
      first_seen: a.first_seen_at ? String(a.first_seen_at).slice(0, 10) : null,
      last_seen: a.last_seen_at ? String(a.last_seen_at).slice(0, 10) : null,
      seniority: a.seniority ?? null,
      salary: a.salary ?? null,
      categories: Array.isArray(a.categories) ? a.categories : [],
      occupation: a.onet_data?.occupation_name ?? null,
      contract: Array.isArray(a.contract_types) ? a.contract_types[0] : null,
    };
  });
}

/**
 * Roles worth a recruiting conversation.
 *
 * The same rule the Apify pull already applies, kept in one place so both
 * sources agree on what counts. A role that fails is not dropped: "they are
 * hiring, but not for anything we can help with" is a real answer and a
 * different one from "they are not hiring".
 */
export function qualifyRole(title = "") {
  const t = String(title).toLowerCase();
  if (/\b(intern|internship|apprentice|student)\b/.test(t)) return false;
  if (/\b(receptionist|office manager|janitor|barista|driver)\b/.test(t)) return false;
  return /\b(engineer|engineering|scientist|architect|developer|technician|program|product|director|vp|vice president|head|chief|principal|staff|lead|manager)\b/.test(t);
}
