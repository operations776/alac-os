// Prospeo HTTP client.
//
// Docs: https://prospeo.io/api-docs. The older `domain-search` and
// `email-finder` endpoints are removed and return DEPRECATED, so nothing here
// uses them.
//
// Auth is a single `X-KEY` header on every POST. Simpler than Fiber, and the
// key never reaches a URL, so there is no query string to redact.
//
// Pricing is the reason this is the people source: search-person costs one
// credit per REQUEST that returns at least one person, not one per person, and
// a repeat of the same request inside 30 days comes back `free: true`. A search
// returning 130 people costs the same as one returning 3.
//
// The filter values are strict enums. Sending "Engineering" instead of
// "Engineering & Technical", or "VP" instead of "Vice President", fails the
// whole request with INVALID_FILTERS rather than silently returning less, which
// is the good failure mode: the enums below were read from the live API and
// confirmed against it.

const BASE = "https://api.prospeo.io";

export class ProspeoError extends Error {
  constructor(message, { status, code, operation } = {}) {
    super(message);
    this.name = "ProspeoError";
    this.status = status;
    this.code = code;
    this.operation = operation;
  }
}

/**
 * Seniority, exactly as the API spells it.
 * Verified live: "VP" is rejected, "Vice President" is accepted.
 */
export const SENIORITY = {
  founder: "Founder/Owner",
  cSuite: "C-Suite",
  partner: "Partner",
  vp: "Vice President",
  head: "Head",
  director: "Director",
  manager: "Manager",
  senior: "Senior",
};

/**
 * Departments. A main department pulls all of its sub-departments, so naming
 * the parent is both broader and cheaper than listing children.
 * Verified live: "Engineering" is rejected, "Engineering & Technical" accepted.
 */
export const DEPARTMENT = {
  engineering: "Engineering & Technical",
  hr: "Human Resources",
  cSuite: "C-Suite",
  product: "Product",
  operations: "Operations",
};

async function call(operation, path, body, { retries = 2 } = {}) {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new ProspeoError("PROSPEO_API_KEY is not set", { operation });

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-KEY": key },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = new ProspeoError(err.message, { operation });
      if (attempt === retries) throw lastErr;
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 400) };
    }

    // Prospeo signals failure with `error: true` in a 200 as well as by status,
    // so both are checked. A filter error is a bug in the caller and must not
    // be retried: it will fail identically every time and burn the rate limit.
    const failed = !res.ok || json?.error === true;
    if (!failed) return json;

    const code = json?.error_code ?? null;
    const message = json?.filter_error ?? json?.error_toast ?? code ?? `HTTP ${res.status}`;
    lastErr = new ProspeoError(message, { status: res.status, code, operation });

    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === retries) throw lastErr;
    await sleep(1000 * 2 ** attempt);
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Plan, credits and renewal date. Free. */
export const accountInformation = () => call("account-information", "account-information", {});

/**
 * People at a company, filtered by seniority and department.
 *
 * `website` is the company domain. Matching on domain rather than name avoids
 * the collision a common company name would cause.
 *
 * One credit per request that returns at least one person. Repeats within 30
 * days return `free: true`, so re-running a pilot costs nothing.
 */
export const searchPerson = ({ website, seniorities, departments, page = 1 }) =>
  call("search-person", "search-person", {
    page,
    filters: {
      company: { websites: { include: [website] } },
      ...(seniorities?.length ? { person_seniority: { include: seniorities } } : {}),
      ...(departments?.length ? { person_department: { include: departments } } : {}),
    },
  });

/**
 * Normalize one search result into the shape the desk stores.
 *
 * `current_job_title` is the field name, not `job_title`. Read from a live
 * response rather than assumed.
 *
 * Email arrives as an object describing status and whether it has been
 * revealed, not as a string. An unrevealed VERIFIED email means Prospeo holds
 * a checked address that costs extra to expose, which is a materially
 * different fact from having no email, so both are represented.
 */
export function normalizePerson(result) {
  const p = result?.person ?? {};
  const email = p.email;
  const emailStatus = typeof email === "object" && email ? (email.status ?? null) : null;
  const emailValue = typeof email === "string" ? email : (email?.email ?? null);

  return {
    external_id: p.person_id ?? null,
    full_name: p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || null),
    title: p.current_job_title ?? null,
    headline: p.headline ?? null,
    linkedin_url: p.linkedin_url ?? null,
    location: typeof p.location === "string" ? p.location : (p.location?.name ?? null),
    email: emailValue,
    email_status: emailStatus,
    email_revealed: typeof email === "object" && email ? Boolean(email.revealed) : Boolean(emailValue),
    last_job_change: p.last_job_change_detected_at ?? null,
  };
}

/**
 * How relevant this person is to a recruiting approach, 0 to 100.
 *
 * Deterministic and pure, like the heat scorer, and for the same reason: the
 * ranking has to be explainable. Talent leaders come first because they own
 * the requisition, then the engineering leaders who own the team, then the
 * executives who own the budget.
 */
export function rankTarget({ title = "", headline = "" }) {
  const text = `${title} ${headline}`.toLowerCase();
  const reasons = [];
  let score = 0;

  const hit = (re, points, why) => {
    if (re.test(text)) {
      score += points;
      reasons.push(why);
    }
  };

  // Owns the requisition. The person a recruiting firm actually contracts with.
  hit(/talent acquisition|head of talent|recruiting|recruitment|talent partner/, 40, "Owns hiring");
  // Owns the team the hire joins.
  hit(/\bvp\b|vice president|head of|chief|cto|coo|ceo/, 25, "Senior leader");
  hit(/engineering|software|hardware|technical|program management/, 15, "Technical org");
  hit(/director/, 12, "Director level");
  hit(/people|hr\b|human resources/, 10, "People function");
  // Someone new in seat is rebuilding a team and is unusually reachable.
  hit(/founder|co-founder/, 8, "Founder");

  return { score: Math.min(score, 100), reasons };
}
