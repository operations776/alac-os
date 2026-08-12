// Normalization and parsing shared by the importers.
//
// Plain .mjs with no imports so the CLI scripts and the app can both use it.

/** Quote-aware CSV parser.
 *
 * The source export has embedded newlines inside quoted description fields, so
 * a line split reports 10,908 rows for a file that holds 8,298. This is the
 * single most important correctness detail in the whole import path.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as objects keyed by the header row. */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** lowercase, no protocol, no www, no path. Empty becomes null. */
export function normDomain(raw) {
  if (!raw) return null;
  const d = String(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/\.$/, "");
  return d && d.includes(".") ? d : null;
}

// Suffixes that carry no identity. Group and Holdings are deliberately kept:
// "Acme Group" and "Acme" can be different companies.
const LEGAL_SUFFIXES = [
  "inc", "incorporated", "llc", "l l c", "ltd", "limited", "corp", "corporation",
  "co", "plc", "gmbh", "ag", "sa", "srl", "bv", "nv", "oy", "ab", "as", "pte",
  "pty", "kk", "spa", "sas", "sl",
];

/** lowercase, legal suffixes stripped, punctuation removed, whitespace collapsed. */
export function normCompany(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/[.,]/g, " ").replace(/[^\w\s&-]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^the\s+/, "");
  // Strip trailing suffixes repeatedly: "acme inc llc" leaves "acme".
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\s+${suffix}$`);
      if (re.test(s)) {
        s = s.replace(re, "");
        changed = true;
      }
    }
  }
  s = s.trim();
  return s || null;
}

/** "$1,100,000" and "$7.7M" are both in the same file. Both become integers. */
export function parseMoney(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[$,\s]/g, "");
  if (!s || s === "-") return null;
  const m = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}

/** "101-200" becomes 150. "5000+" becomes 5000. */
export function parseBandMidpoint(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/,/g, "").trim();
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
  const plus = s.match(/(\d+)\s*\+/);
  if (plus) return parseInt(plus[1], 10);
  const single = s.match(/^(\d+)$/);
  return single ? parseInt(single[1], 10) : null;
}

/** "Lancaster, Pennsylvania, United States" gives "Pennsylvania". */
export function parseState(raw) {
  if (!raw) return null;
  const parts = String(raw).split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2] || null;
  if (parts.length === 2) return parts[0] || null;
  return null;
}

export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // LinkedIn exports use "08 May 2025".
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function splitTags(raw) {
  if (!raw) return [];
  return String(raw).split(";").map((t) => t.trim()).filter(Boolean).slice(0, 40);
}

// Title ladder from the client's stated decision-maker priority.
const C_SUITE = /\b(ceo|cto|coo|cfo|chief|founder|co-founder|owner|president|partner)\b/i;
const VP = /\b(vp|vice president|svp|evp|head of)\b/i;
const DIRECTOR = /\b(director|dir\.)\b/i;
const MANAGER = /\b(manager|mgr|lead)\b/i;
const TALENT = /\b(talent|recruit|recruiting|recruitment|people|hr|human resources|staffing)\b/i;

export function seniorityOf(title) {
  if (!title) return null;
  if (C_SUITE.test(title)) return "c_suite";
  if (VP.test(title)) return "vp";
  if (DIRECTOR.test(title)) return "director";
  if (MANAGER.test(title)) return "manager";
  return "ic";
}

/** Highest conversion is a talent leader, then engineering leadership, then founders. */
export function isDecisionMaker(title) {
  if (!title) return false;
  const senior = C_SUITE.test(title) || VP.test(title) || DIRECTOR.test(title);
  if (TALENT.test(title) && (senior || MANAGER.test(title))) return true;
  return senior;
}
