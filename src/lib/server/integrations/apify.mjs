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
 * The two actors, both overridable. Actors get renamed, deprecated, or start
 * demanding a paid rental, and swapping one should not need a code change.
 *
 * `bebity/linkedin-jobs-scraper` was the first choice and is out: its free
 * trial has expired, so it returns actor-is-not-rented. Both of these run on
 * the current plan, verified live.
 */
export const JOBS_ACTOR = process.env.APIFY_JOBS_ACTOR ?? "curious_coder/linkedin-jobs-scraper";
export const COMPANY_ACTOR = process.env.APIFY_COMPANY_ACTOR ?? "harvestapi/linkedin-company";

/**
 * The LinkedIn numeric org id, plus website and headcount, from a company page.
 *
 * This is the link that makes precise job search possible. LinkedIn's job
 * search filters by `f_C=<org id>`, and we hold slugs, not ids. Searching by
 * company NAME instead returns competitors mixed in with the target: a keyword
 * search for "Astranis" came back with SpaceX, Antares and Array Labs, which
 * would have quietly attributed other companies' roles to this account.
 */
export async function resolveCompanies(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const urls = slugs.map((s) => `https://www.linkedin.com/company/${s}`);
  const items = await runActorSync(COMPANY_ACTOR, {
    companies: urls,
    urls,
    maxItems: slugs.length,
  });
  return items
    .map((c) => ({
      org_id: c.id ? String(c.id) : null,
      slug: c.universalName ?? null,
      name: c.name ?? null,
      website: c.website ?? null,
      employee_count: Number.isFinite(c.employeeCount) ? c.employeeCount : null,
      linkedin_url: c.linkedinUrl ?? null,
    }))
    .filter((c) => c.org_id);
}

/**
 * Open roles at companies, by LinkedIn numeric org id.
 *
 * One search URL per company rather than one combined search, because
 * LinkedIn's `f_C` filter takes a single id and combining them would make it
 * impossible to attribute a posting back to the right account.
 */
export async function fetchJobsForOrgIds(orgIds, { maxPerCompany = 25 } = {}) {
  if (!Array.isArray(orgIds) || orgIds.length === 0) return [];
  return runActorSync(JOBS_ACTOR, {
    urls: orgIds.map((id) => `https://www.linkedin.com/jobs/search/?f_C=${id}`),
    rows: orgIds.length * maxPerCompany,
    count: orgIds.length * maxPerCompany,
    maxItems: orgIds.length * maxPerCompany,
    // Company detail is already known from resolveCompanies, and asking for it
    // again on every posting multiplies the cost for nothing.
    scrapeCompany: false,
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

  // "Not Applicable" is what LinkedIn returns when a posting has no seniority
  // set, which is most of them. Passing that through would let the scorer treat
  // an unstated level as a stated one, so it becomes null.
  const rawSeniority = pick("seniorityLevel", "seniority", "experienceLevel");
  const seniority =
    rawSeniority && !/^not applicable$/i.test(String(rawSeniority)) ? String(rawSeniority) : null;

  // The company each posting belongs to. The jobs actor is called with one
  // search URL per company, and `inputUrl` echoes which one produced this row,
  // so the f_C id in it is how a posting is attributed back to an account.
  const inputUrl = pick("inputUrl");
  const orgId = inputUrl ? (String(inputUrl).match(/f_C=(\d+)/)?.[1] ?? null) : null;

  return {
    external_id: String(pick("id", "jobId", "jobPostingId", "link", "url") ?? title),
    title: String(title),
    url: pick("link", "url", "jobUrl", "applyUrl"),
    location: typeof location === "string" ? location : (location?.name ?? null),
    seniority,
    job_function: pick("jobFunction", "function", "category"),
    posted_at: posted ? String(posted).slice(0, 10) : null,
    description: pick("descriptionText", "description", "jobDescription"),
    company_name: pick("companyName", "company"),
    org_id: orgId,
    applicants: pick("applicantsCount"),
  };
}
