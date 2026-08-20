// Turn a Fiber tracker signal into the shape the desk records.
//
// A tracker signal is a detected change. A heat signal is a reason to contact
// an account today. This module is the translation between them, and it is
// pure so it can be tested against the payloads Fiber's own preview endpoint
// returns rather than against invented ones.
//
// Every shape below was read from `POST /v1/tracker/rules/preview-signal`, not
// guessed. Where a rule is not worth surfacing to the desk it is mapped to
// null and dropped, deliberately and by name: a logo change is a real detected
// change and not a reason to call anyone.

/**
 * The rules worth watching, and what each one means to this desk.
 *
 * `weight` is a nudge, not a score: it seeds the narrative and decides ordering
 * between two signals that land the same day. The actual 100 point score comes
 * from the heat scorer, which reads the extracted fields below.
 */
export const WATCHED_RULES = {
  new_funding_round: { kind: "funding", label: "Funding round" },
  funding_stage_changed: { kind: "funding", label: "Funding stage changed" },
  new_investor: { kind: "funding", label: "New investor" },
  company_news: { kind: "news", label: "Company news" },
  news_with_keyword: { kind: "news", label: "News match" },
  headcount_growth_percent: { kind: "growth", label: "Headcount growth" },
  headcount_crossed_threshold: { kind: "growth", label: "Headcount threshold" },
  employee_count_milestone: { kind: "growth", label: "Headcount milestone" },
  department_size_threshold: { kind: "growth", label: "Department growth" },
  job_posting_with_keyword: { kind: "hiring", label: "Job posting" },
  job_posting_in_function: { kind: "hiring", label: "Job posting" },
  recently_hired_with_title: { kind: "leadership", label: "Leadership hire" },
  company_status_changed: { kind: "status", label: "Status changed" },
  acquired_company: { kind: "status", label: "Made an acquisition" },
  new_office_location: { kind: "expansion", label: "New office" },
  recent_layoffs: { kind: "risk", label: "Layoffs reported" },
};

/**
 * Rules we deliberately ignore. Named rather than silently filtered, so that
 * "why did nothing fire" has an answer and turning one on later is a one line
 * change with a reason attached.
 */
export const IGNORED_RULES = {
  company_logo_changed: "cosmetic",
  company_name_changed: "cosmetic, and it breaks matching rather than creating an opening",
  company_description_changed: "cosmetic",
  follower_count_growth: "vanity metric, no hiring implication",
  company_posted: "too noisy without a keyword",
  company_posted_with_keyword: "useful later, needs a curated keyword list first",
  technology_added: "not an ALAC hiring signal",
  hq_location_changed: "covered by new_office_location when it matters",
  company_went_inactive: "a suppression trigger, not a heat signal",
};

const firstItem = (changeData) =>
  Array.isArray(changeData) ? (changeData[0] ?? null) : (changeData ?? null);

/** Coerce Fiber's ISO timestamps to the yyyy-mm-dd the schema stores. */
export function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** A readable money string for the workbook's "The Number" column. */
export function formatAmount(usd) {
  if (usd == null || !Number.isFinite(Number(usd))) return null;
  const n = Number(usd);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/**
 * Extract the fields the heat scorer needs from one signal.
 *
 * Returns null for a rule that is not watched, so the caller drops it. Every
 * branch reads the payload shape Fiber documented for that rule; an unknown
 * shape yields nulls rather than throwing, because one malformed signal must
 * not take down a pull of two hundred.
 */
export function parseSignal(signal) {
  const type = signal?.type ?? signal?.signal?.type;
  const rule = WATCHED_RULES[type];
  if (!rule) return null;

  const sig = signal?.signal ?? signal;
  const data = firstItem(sig?.changeData);
  const out = {
    rule_type: type,
    kind: rule.kind,
    label: rule.label,
    summary: sig?.summary ?? null,
    amountUsd: null,
    roundLabel: null,
    sourceUrl: null,
    occurredAt: null,
    detail: null,
    // How Fiber says it detected and verified the change. This is the evidence
    // behind the claim, so it is carried through to the row rather than
    // discarded: the grounding rule needs something to cite.
    methodology: sig?.methodology ?? null,
  };

  switch (type) {
    case "new_funding_round":
      out.amountUsd = data?.amountUsd ?? null;
      out.roundLabel = data?.type ? String(data.type).replace(/_/g, " ") : null;
      out.occurredAt = toDate(data?.date);
      out.sourceUrl = data?.crunchbaseUrl ?? null;
      out.detail = Array.isArray(data?.investors) && data.investors.length
        ? `Investors: ${data.investors.join(", ")}`
        : null;
      break;

    case "funding_stage_changed":
      out.roundLabel = data?.current ? String(data.current).replace(/_/g, " ") : null;
      break;

    case "new_investor":
      out.detail = data?.name ? `New investor: ${data.name}` : null;
      out.sourceUrl = data?.crunchbaseUrl ?? null;
      break;

    case "company_news":
    case "news_with_keyword":
      // The only rule that hands over a citable URL for free, which is exactly
      // what the grounding rule needs.
      out.sourceUrl = data?.url ?? null;
      out.occurredAt = toDate(data?.publishedAt);
      out.detail = data?.summary ?? data?.title ?? null;
      break;

    case "headcount_growth_percent":
    case "headcount_crossed_threshold":
    case "employee_count_milestone":
      out.detail = data?.previous != null && data?.current != null
        ? `Headcount ${data.previous} to ${data.current}`
        : null;
      break;

    case "department_size_threshold":
      out.detail = data?.department ? `${data.department} now ${data.count}` : null;
      break;

    case "job_posting_with_keyword":
    case "job_posting_in_function":
      out.sourceUrl = data?.jobUrl ?? null;
      out.occurredAt = toDate(data?.postedAt);
      out.detail = data?.title ? `${data.title}${data.location ? `, ${data.location}` : ""}` : null;
      break;

    case "recently_hired_with_title":
      out.sourceUrl = data?.linkedinUrl ?? null;
      out.occurredAt = toDate(data?.startDate);
      out.detail = data?.name && data?.title ? `${data.name} joined as ${data.title}` : null;
      break;

    case "company_status_changed":
      out.detail = data?.previous && data?.current
        ? `Status ${data.previous} to ${data.current}`
        : null;
      break;

    case "acquired_company":
      // The company made an acquisition. Money moved and two org charts are
      // about to merge, which is a hiring event on both sides.
      out.amountUsd = data?.priceUsd ?? null;
      out.occurredAt = toDate(data?.acquisitionDate);
      out.sourceUrl = data?.acquireeUrl ?? null;
      out.detail = data?.acquireeName ? `Acquired ${data.acquireeName}` : null;
      break;

    case "new_office_location":
      out.detail = [data?.city, data?.state, data?.country].filter(Boolean).join(", ") || null;
      if (out.detail) out.detail = `New office: ${out.detail}`;
      break;

    case "recent_layoffs":
      // The field is numLaidOff, not count. Read from the live payload rather
      // than assumed, which is why this is not the shape it was first written
      // against.
      out.occurredAt = toDate(data?.date);
      out.sourceUrl = data?.source ?? null;
      out.detail = data?.numLaidOff != null
        ? `${data.numLaidOff} roles cut${data.percentLaidOff != null ? `, ${data.percentLaidOff}% of staff` : ""}`
        : null;
      break;

    default:
      break;
  }

  // Fall back to the signal's own sources array when the rule did not carry a
  // URL of its own. Something citable beats nothing citable.
  if (!out.sourceUrl && Array.isArray(sig?.sources) && sig.sources.length > 0) {
    out.sourceUrl = sig.sources[0];
  }

  return out;
}

/**
 * The stable key for a signal.
 *
 * Fiber's own `eventId` is the right identity and the docs say to dedupe on it,
 * so it is used when present. The fallback composes company, rule and date,
 * which is what keeps a re-pull of the same window idempotent when an older
 * signal predates event ids.
 */
export function signalKey(signal, normName, occurredAt) {
  const eventId = signal?.eventId ?? signal?.id;
  if (eventId) return `fiber:${eventId}`;
  const type = signal?.type ?? signal?.signal?.type ?? "unknown";
  return `fiber:${normName}|${type}|${occurredAt ?? "undated"}`;
}

/**
 * The identifiers Fiber attaches to a signal, normalized.
 *
 * The slug is what matches back to tam_accounts, because that is the identifier
 * the tracker list was built from in the first place.
 */
export function signalEntity(signal) {
  const ids = signal?.entity?.identifiers ?? {};
  return {
    slug: (ids.linkedinSlug ?? signal?.linkedinSlug ?? null)?.toLowerCase?.() ?? null,
    orgId: ids.linkedinOrgId ?? signal?.linkedinIdentifier ?? null,
    domain: ids.domain ?? null,
    name: ids.name ?? signal?.companyName ?? null,
  };
}
