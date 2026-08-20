// Apify HTTP client, for job postings only.
//
// Docs: https://docs.apify.com/api/v2
//
// Why this exists alongside Fiber: Fiber bills one credit per job posting
// found, and the working market has tens of thousands of open roles. Pulling
// them all through Fiber would cost about 24,000 credits against a balance of
// a few hundred. Apify's job actors charge roughly $0.40 per 1,000 jobs, which
// makes the same pull cost about ten dollars.
//
// It is used for job postings and nothing else. Signals stay on Fiber because
// Fiber WATCHES: it notices a funding round on its own schedule and hands back
// a structured event, and its signal endpoints are free. Reproducing that with
// scrapers would mean running jobs on a timer and diffing the results myself,
// which is a lot of moving parts to rebuild something that already works.
//
// The tradeoff to be honest about: these are third party scrapers pointed at
// LinkedIn. They break when LinkedIn changes its markup, and a run can return
// nothing without erroring. Every caller therefore has to treat an empty result
// as "we could not look" rather than "there are no jobs", which is the same
// distinction the heat scorer already makes.

const BASE = "https://api.apify.com/v2";

export class ApifyError extends Error {
  constructor(message, { status, actor } = {}) {
    super(message);
    this.name = "ApifyError";
    this.status = status;
    this.actor = actor;
  }
}

/** The token, from the environment. Never logged. */
function token() {
  const t = process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN;
  if (!t) throw new ApifyError("APIFY_TOKEN is not set");
  return t;
}

/**
 * Strip the token from anything that might be printed.
 *
 * Apify accepts the token as a query parameter as well as a header, so it can
 * end up inside a URL in an error body even though this client always uses the
 * header.
 */
export function redact(text) {
  if (!text) return text;
  return String(text)
    .replace(/apify_api_[A-Za-z0-9]+/g, "[APIFY_TOKEN]")
    .replace(/([?&]token=)[^&\s"']+/gi, "$1[REDACTED]");
}

async function request(path, { method = "GET", body, timeoutMs = 300_000 } = {}) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token()}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    if (!res.ok) {
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      throw new ApifyError(redact(message), { status: res.status });
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Whoami. Free, and the cheapest way to confirm a token works. */
export const me = () => request("/users/me");

/**
 * Run an actor and wait for it, returning the dataset items directly.
 *
 * `run-sync-get-dataset-items` is the one call version of start, poll, fetch.
 * Apify holds the connection for at most 5 minutes, so this is only correct
 * for runs that finish quickly. A whole market pull is therefore chunked by
 * the caller rather than submitted as one enormous run.
 */
export async function runActorSync(actorId, input, { timeoutMs = 300_000 } = {}) {
  // Actor ids contain a slash, which has to survive as ~ in the path.
  const id = actorId.replace("/", "~");
  const items = await request(`/acts/${id}/run-sync-get-dataset-items`, {
    method: "POST",
    body: input,
    timeoutMs,
  });
  return Array.isArray(items) ? items : [];
}

/**
 * Open roles at a set of companies, by LinkedIn slug.
 *
 * The actor is configurable because Apify actors come and go, and pinning one
 * inside the code would mean a code change to switch. APIFY_JOBS_ACTOR
 * overrides it.
 */
export const JOBS_ACTOR = process.env.APIFY_JOBS_ACTOR ?? "valig/linkedin-jobs-scraper";

export async function fetchJobsForCompanies(slugs, { maxPerCompany = 25 } = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const urls = slugs.map((s) => `https://www.linkedin.com/company/${s}/jobs/`);
  return runActorSync(JOBS_ACTOR, {
    // Actors differ in what they call their inputs, so the common aliases are
    // all supplied. An actor ignores the keys it does not recognise, and this
    // is cheaper than a lookup table that goes stale.
    startUrls: urls.map((url) => ({ url })),
    urls,
    companyUrls: urls,
    maxItems: slugs.length * maxPerCompany,
    maxResults: slugs.length * maxPerCompany,
    rows: slugs.length * maxPerCompany,
  });
}

/**
 * Normalize one scraped posting.
 *
 * Actors disagree on field names, so each value is read from a list of
 * plausible keys. Anything that cannot be identified is left null rather than
 * guessed: a posting with no title is not a posting.
 */
export function normalizeJob(item) {
  const pick = (...keys) => {
    for (const k of keys) {
      const v = item?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
  };

  const title = pick("title", "jobTitle", "position", "name");
  if (!title) return null;

  const location = pick("location", "jobLocation", "formattedLocation", "place");
  const posted = pick("postedAt", "postedDate", "publishedAt", "listedAt", "date");

  return {
    external_id: String(pick("id", "jobId", "jobPostingId", "url", "link") ?? title),
    title: String(title),
    url: pick("url", "link", "jobUrl", "applyUrl"),
    location: typeof location === "string" ? location : (location?.name ?? null),
    seniority: pick("seniorityLevel", "seniority", "experienceLevel"),
    job_function: pick("function", "jobFunction", "category"),
    posted_at: posted ? String(posted).slice(0, 10) : null,
    description: pick("description", "descriptionText", "jobDescription"),
    company_slug: pick("companySlug", "companyUsername", "company"),
  };
}
