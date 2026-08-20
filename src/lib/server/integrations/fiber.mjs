// Fiber AI HTTP client.
//
// Docs: https://api.fiber.ai/llms.txt, then /ai-docs/<operationId>.md.
//
// Written against the HTTP API rather than the @fiberai/sdk, for the same
// reason the xlsx reader has no dependency: the surface used here is four
// endpoints, and a pinned SDK is a larger thing to keep current than four
// fetch calls. If the surface grows past a dozen operations, revisit that.
//
// Auth is unusual and worth stating once: the API key goes in the QUERY STRING
// for GET operations and in the JSON BODY for POST operations. There is no
// Authorization header. That means the key can end up in a URL, so it is never
// logged: `redact` scrubs it from anything this module prints or throws.

const BASE = "https://api.fiber.ai";

/** Remove the key from any string before it reaches a log or an error. */
export function redact(text, key) {
  if (!text) return text;
  let out = String(text);
  if (key) out = out.split(key).join("[FIBER_KEY]");
  // Belt and braces: strip any apiKey query parameter, whatever its value, in
  // case a URL from an error body carries a different key than ours.
  return out.replace(/([?&]apiKey=)[^&\s"']+/gi, "$1[REDACTED]");
}

export class FiberError extends Error {
  constructor(message, { status, operation, body } = {}) {
    super(message);
    this.name = "FiberError";
    this.status = status;
    this.operation = operation;
    this.body = body;
  }
}

/**
 * One call. `method` decides where the key goes, per the note above.
 *
 * Retries only what is worth retrying: a 429 or a 5xx is transient, a 400 or a
 * 401 is a bug or a bad key and retrying it just burns the rate limit. The
 * documented limit is 120 requests per minute on these endpoints.
 */
async function call(operation, path, { key, method = "POST", query = {}, body = {}, retries = 2 } = {}) {
  if (!key) throw new FiberError("FIBER_API_KEY is not set", { operation });

  const url = new URL(path, BASE);
  if (method === "GET") {
    url.searchParams.set("apiKey", key);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const init = { method, headers: { accept: "application/json" } };
  if (method !== "GET") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify({ apiKey: key, ...body });
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastErr = new FiberError(redact(err.message, key), { operation });
      // A network error is transient by nature, so it falls through to the
      // backoff below rather than failing the whole run.
      if (attempt === retries) throw lastErr;
      await sleep(backoffMs(attempt));
      continue;
    }

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    if (res.ok) return parsed;

    const message = redact(parsed?.message ?? `HTTP ${res.status}`, key);
    const transient = res.status === 429 || res.status >= 500;
    lastErr = new FiberError(message, { status: res.status, operation, body: parsed });
    if (!transient || attempt === retries) throw lastErr;
    await sleep(backoffMs(attempt, res.headers.get("retry-after")));
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt, retryAfter) {
  const header = Number(retryAfter);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 30_000);
  return Math.min(1000 * 2 ** attempt, 15_000);
}

/**
 * The LinkedIn company slug from a company URL.
 *
 * Fiber identifies companies by slug, and tam_accounts stores the full URL, so
 * every job search and tracker write goes through this. Returns null rather
 * than a guess when the URL is not a company page: a personal profile URL in
 * that column is a data error and must not be sent as a company.
 */
export function linkedinSlug(url) {
  if (!url) return null;
  const m = String(url).match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1]).trim().toLowerCase() || null;
}

/* -------------------------------------------------------------------------
   Operations
   ---------------------------------------------------------------------- */

/**
 * List the tracker rule types. Free, deterministic, and needs no list to
 * exist, which makes it the right call for verifying a key.
 */
export const listTrackerRules = (key) =>
  call("listAvailableTrackerRules", "/v1/tracker/rules", { key, method: "GET" });

/** Organization credit balance. Free. */
export const getOrgCredits = (key) =>
  call("getOrgCredits", "/v1/get-org-credits", { key, method: "GET" });

/** Rate limits for this organization. Free. */
export const getRateLimits = (key) =>
  call("getRateLimits", "/v1/rate-limits", { key, method: "GET" });

/** Existing company tracker lists. Free. */
export const listTrackerCompanyLists = (key) =>
  call("listTrackerCompanyLists", "/v1/tracker/company-lists", { key, method: "GET" });

/**
 * Signals detected for a tracker list. Free, and the backbone of the whole
 * pipeline: this is where a real world change becomes a row.
 *
 * `filter: "dummy"` returns only test signals from fire-dummy, which is how
 * the integration is validated without waiting for a company to raise money.
 */
export const listTrackerSignals = (key, listId, { since, cursor, pageSize, filter } = {}) =>
  call("listTrackerSignals", `/v1/tracker/signals/${encodeURIComponent(listId)}`, {
    key,
    method: "GET",
    query: { since, cursor, pageSize, filter },
  });

/**
 * Job postings for a set of LinkedIn company slugs.
 *
 * Costs 1 credit per posting FOUND, so the caller controls the blast radius:
 * this is never run across the whole queue, only across the accounts a signal
 * has already surfaced.
 */
export const searchJobPostings = (key, slugs, extra = {}) =>
  call("jobPostingSearch", "/v1/job-search", {
    key,
    body: {
      searchParams: {
        companies: { identifier: "linkedinSlug", value: slugs },
        ...extra,
      },
    },
  });

/** How many postings a search would return. Use before spending on the search. */
export const countJobPostings = (key, slugs, extra = {}) =>
  call("jobPostingSearchCount", "/v1/job-search/count", {
    key,
    body: {
      searchParams: {
        companies: { identifier: "linkedinSlug", value: slugs },
        ...extra,
      },
    },
  });
