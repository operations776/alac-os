/**
 * A figure the workbook holds as text, written the way a person would.
 *
 * A spreadsheet cell typed as a number is stored in the file as a raw
 * double, so 46058871 arrives as the string "4.6058871E7". Rendered
 * verbatim that put scientific notation on the signal card.
 *
 * Only a bare number is reformatted. A value already written for a reader,
 * "$46M" or "12 hires" or "Series B", was written deliberately and is
 * returned untouched: this formats, it never interprets.
 *
 * One definition, used by the importer on the way in and by the screen for
 * rows imported before the importer knew to do it.
 */
export function formatFigure(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (abs >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return n.toLocaleString("en-US");
}
