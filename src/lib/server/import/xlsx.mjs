// A minimal xlsx reader. No dependency, because the whole job is "unzip, read
// two XML parts, hand back rows of strings" and a spreadsheet library is a
// large surface to take on for that.
//
// The one subtlety, and the reason this file has tests rather than being
// inlined into the importer: a cell has two forms in the XML.
//
//   <c r="K5" s="38"/>                 empty, self closing
//   <c r="M5" t="s"><v>501</v></c>     valued, shared string
//
// A naive /<c([^>]*)>([\s\S]*?)<\/c>/ matches the self closing cell's opening
// tag and then runs its body forward to the NEXT cell's closing tag. The empty
// cell swallows its neighbour: the value lands under the wrong column letter,
// and because the `t="s"` attribute belonged to the swallowed cell the shared
// string is never resolved, so a company name arrives as the integer 501.
//
// That failure is silent. Every row still parses, the column count still looks
// plausible, and the data is wrong. This is the same class as the CSV bug in
// CLAUDE.md: a structured format parsed by a regex that is almost right.


import { execFileSync } from "node:child_process";

const unesc = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

export function colIdx(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Excel serial date to ISO yyyy-mm-dd.
 *
 * The epoch offset is 25569 days, which already absorbs the 1900 leap year bug
 * Excel ships for Lotus compatibility. Serials below 60 predate that bug and
 * are off by one, but nothing in this workbook is dated 1900, so they are not
 * special cased here.
 */
export function serialToISO(n) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num) || num <= 0) return null;
  const d = new Date(Math.round((num - 25569) * 86400 * 1000));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Parse the cells of one <row> body into a sparse array indexed by column.
 * Exported so the self closing cell case can be tested without a real xlsx.
 */
export function parseCells(rowBody, shared = []) {
  const cells = [];
  // Both cell forms, in one alternation. See the note at the top of the file.
  for (const cm of rowBody.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = cm[1];
    const body = cm[2] ?? "";
    const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
    if (!ref) continue;
    const t = attrs.match(/t="([^"]+)"/)?.[1];
    let v = "";
    if (t === "inlineStr") {
      for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) v += m[1];
      v = unesc(v);
    } else {
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (raw != null) v = t === "s" ? shared[+raw] ?? "" : unesc(raw);
    }
    cells[colIdx(ref)] = v;
  }
  return cells;
}

/** Extract one file from a zip via the system unzip, as text. */
function unzipText(zipPath, member) {
  return execFileSync("unzip", ["-p", zipPath, member], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * Open a workbook. Returns { sheetNames, sheet(name) -> rows }, where a row is
 * { rnum, cells } and cells is a sparse array indexed by column.
 */
export function openWorkbook(path) {
  const wb = unzipText(path, "xl/workbook.xml");
  const rels = unzipText(path, "xl/_rels/workbook.xml.rels");

  const relTarget = new Map();
  for (const m of rels.matchAll(/<Relationship([^>]*)\/>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1];
    const target = m[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, ""));
  }

  const sheets = [];
  for (const m of wb.matchAll(/<sheet([^>]*)\/>/g)) {
    const name = m[1].match(/name="([^"]+)"/)?.[1];
    const rid = m[1].match(/r:id="([^"]+)"/)?.[1];
    if (name && rid && relTarget.has(rid)) {
      sheets.push({ name: unesc(name), file: relTarget.get(rid) });
    }
  }

  // Shared strings are optional: a workbook with only inline strings has none.
  let shared = [];
  try {
    const ss = unzipText(path, "xl/sharedStrings.xml");
    for (const si of ss.split("<si>").slice(1)) {
      const chunk = si.split("</si>")[0];
      let text = "";
      for (const t of chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
      shared.push(unesc(text));
    }
  } catch {
    shared = [];
  }

  const sheet = (name) => {
    const s = sheets.find((x) => x.name === name);
    if (!s) throw new Error(`sheet not found: ${name}. Have: ${sheets.map((x) => x.name).join(", ")}`);
    const xml = unzipText(path, `xl/${s.file}`);
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      rows.push({ rnum: +rm[1], cells: parseCells(rm[2], shared) });
    }
    return rows;
  };

  return { sheetNames: sheets.map((s) => s.name), sheet };
}
