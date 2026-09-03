// Read a pasted CV or job description into the fields the Demand Radar needs.
//
// Deliberately deterministic string work rather than a model call. Three
// reasons: it is free and instant, every field it fills can be traced to the
// line it came from, and a wrong guess is visible to the operator rather than
// confidently wrong. Nothing is invented: a field it cannot find stays empty
// and the form says so.
//
// Everything it extracts is editable afterwards, because the brief asks for
// owner refinement regardless of what the classifier decided.

/** Clearance, as written in defence CVs and postings. */
export function readClearance(text) {
  const t = text.toLowerCase();
  if (/\bts\s*\/\s*sci\b|\btssci\b|top secret\s*\/\s*sci/.test(t)) return "TS/SCI";
  if (/\bpoly(graph)?\b/.test(t) && /\bclearance|cleared|ts\b/.test(t)) return "TS/SCI with polygraph";
  if (/\btop secret\b/.test(t)) return "Top Secret";
  if (/\bsecret\b/.test(t)) return "Secret";
  if (/\bpublic trust\b/.test(t)) return "Public Trust";
  if (/\b(active|current)\s+clearance\b|\bcleared\b/.test(t)) return "Clearance held";
  return null;
}

/** The domains and customers that make someone credible in this market. */
const DOMAINS = [
  "UAS", "UAV", "loitering munitions", "autonomy", "ISR", "GNC", "avionics",
  "propulsion", "hypersonics", "radar", "electronic warfare", "RF",
  "satellite", "space systems", "maritime", "submarine", "undersea",
  "counter-UAS", "missile defense", "C2", "SIGINT", "EO/IR",
  "flight software", "embedded systems", "robotics", "additive manufacturing",
  "Navy", "NAVSEA", "NAVAIR", "Marine Corps", "SOCOM", "Army", "Air Force",
  "Space Force", "DARPA", "ONR", "DoD", "IC",
];

export function readDomains(text) {
  const t = text.toLowerCase();
  const found = DOMAINS.filter((d) => {
    const needle = d.toLowerCase();
    // Short acronyms need word boundaries or they match inside other words.
    return needle.length <= 4
      ? new RegExp(`\\b${needle.replace(/[/-]/g, "[/-]?")}\\b`).test(t)
      : t.includes(needle);
  });
  return [...new Set(found)];
}

/** The most senior title in the text, which is the one that matters. */
const TITLE_PATTERNS = [
  /\b(chief\s+\w+\s+officer|chief\s+(engineer|scientist|architect))\b/i,
  /\b(?:senior\s+)?vice president(?:,?\s+of)?\s+[\w\s&]{3,40}/i,
  /\b(?:sr\.?\s+|senior\s+)?director(?:,?\s+of)?\s+[\w\s&]{3,40}/i,
  /\b(?:vp|svp|evp)\s*,?\s*(?:of\s+)?[\w\s&]{3,40}/i,
  /\bhead of\s+[\w\s&]{3,40}/i,
  /\b(?:principal|staff|lead|senior|sr\.?)\s+[\w\s]{3,40}(?:engineer|scientist|manager|architect)\b/i,
  /\b[\w\s]{3,30}(?:engineer|scientist|manager|architect|director)\b/i,
];

export function readTitle(text) {
  // Only the first 40 lines: a CV's own title sits at the top, and later
  // matches are previous roles or the names of people they worked for.
  const head = text.split(/\r?\n/).slice(0, 40).join("\n");
  for (const re of TITLE_PATTERNS) {
    const m = head.match(re);
    if (m) {
      return m[0]
        .replace(/\s+/g, " ")
        .replace(/[,;|]+$/, "")
        .trim()
        .slice(0, 120);
    }
  }
  return null;
}

/** A name, from the first line that looks like one and nothing else. */
export function readName(text) {
  for (const raw of text.split(/\r?\n/).slice(0, 12)) {
    const line = raw.trim();
    if (!line || line.length > 60) continue;
    if (/@|https?:|\d{3}|resume|curriculum|profile/i.test(line)) continue;
    // Two to four capitalised words, which is what a name on a CV looks like.
    if (/^[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’.-]+){1,3}$/.test(line)) return line;
  }
  return null;
}

export function readEmail(text) {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  return m ? m[0] : null;
}

export function readLinkedIn(text) {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  return m ? `https://${m[0].replace(/^https?:\/\//, "").replace(/^www\./, "")}` : null;
}

/** US locations, the ones this market actually hires in. */
const PLACES = [
  "Arlington, Virginia", "Washington, DC", "El Segundo, California",
  "Los Angeles, California", "San Diego, California", "Long Beach, California",
  "Denver, Colorado", "Colorado Springs, Colorado", "Huntsville, Alabama",
  "Austin, Texas", "Dallas, Texas", "Seattle, Washington", "Boston, Massachusetts",
  "Melbourne, Florida", "Tucson, Arizona", "Costa Mesa, California",
];

export function readLocation(text) {
  for (const p of PLACES) {
    const [city] = p.split(",");
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) return p;
  }
  // "City, ST" as written in a CV header.
  const m = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\b/);
  return m ? `${m[1]}, ${m[2]}` : null;
}

export function readComp(text) {
  const m = text.match(/\$\s?(\d{2,3})[,.]?(\d{3})?\s*(?:k\b|,000|000)?/i);
  if (!m) return null;
  const n = m[2] ? Number(`${m[1]}${m[2]}`) : Number(m[1]) * 1000;
  return n >= 50_000 && n <= 1_000_000 ? `$${n.toLocaleString()}` : null;
}

/**
 * Everything at once, plus a note of which fields were found.
 *
 * `found` is the point: the form shows what was read and what was not, so the
 * operator can see the parser's work rather than trusting it.
 */
export function parseProfile(text) {
  const clean = String(text ?? "").slice(0, 40_000);
  const out = {
    full_name: readName(clean),
    title: readTitle(clean),
    email: readEmail(clean),
    linkedin_url: readLinkedIn(clean),
    geography: readLocation(clean),
    clearance: readClearance(clean),
    domains: readDomains(clean).join(", ") || null,
    comp_target: readComp(clean),
  };
  return {
    ...out,
    found: Object.entries(out).filter(([, v]) => v).map(([k]) => k),
  };
}
