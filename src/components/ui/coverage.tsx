import Link from "next/link";

/**
 * SourceWhale campaign coverage, section 15.2.
 *
 * The question this answers, in his words: "Are the accounts I care about
 * actually loaded and being worked in SourceWhale?" So the segments separate
 * loaded from active on purpose, because the guardrail he states twice is
 * that being in SourceWhale is not the same as being worked.
 *
 * Every segment is a link. A coverage bar nobody can click through is a
 * picture of a number rather than a way into the records.
 */

const SEGMENTS = [
  { key: "Active Campaign", label: "Active", color: "var(--alac-good)" },
  { key: "Replied", label: "Replied", color: "var(--alac-cyan)" },
  { key: "Positive Reply", label: "Positive", color: "var(--alac-purple)" },
  { key: "Added", label: "Added, not active", color: "var(--alac-warn)" },
  { key: "Paused", label: "Paused", color: "var(--alac-warn)" },
  { key: "Not Added", label: "Not added", color: "var(--alac-line-strong)" },
];

export function CoverageBar({
  band,
  label,
  counts,
}: {
  band: string;
  label: string;
  counts: Record<string, number>;
}) {
  const total = SEGMENTS.reduce((n, s) => n + (counts[s.key] ?? 0), 0);
  if (total === 0) {
    return (
      <div className="text-[12.5px] text-[var(--alac-text-3)]">
        {label}: nothing ranked yet
      </div>
    );
  }

  const loaded = total - (counts["Not Added"] ?? 0);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3">
        <span className="placard text-[11px] text-[var(--alac-text-2)]">{label}</span>
        <span className="readout text-[12.5px] text-[var(--alac-text-3)]">
          {loaded} of {total} loaded
        </span>
      </div>

      {/* The bar. Segments are proportional, and a segment with a count but
          almost no width still gets a minimum so it stays clickable. */}
      <div className="flex h-[10px] w-full overflow-hidden rounded-[var(--alac-radius-sm)] bg-[var(--alac-surface-2)]">
        {SEGMENTS.map((s) => {
          const n = counts[s.key] ?? 0;
          if (n === 0) return null;
          return (
            <Link
              key={s.key}
              href={`/queue?band=${band}&sw=${encodeURIComponent(s.key)}`}
              title={`${n} ${s.label}`}
              style={{ width: `${Math.max(3, (n / total) * 100)}%`, background: s.color }}
              className="block transition-opacity hover:opacity-70"
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {SEGMENTS.map((s) => {
          const n = counts[s.key] ?? 0;
          if (n === 0) return null;
          return (
            <Link
              key={s.key}
              href={`/queue?band=${band}&sw=${encodeURIComponent(s.key)}`}
              className="inline-flex items-baseline gap-1.5 text-[12px] text-[var(--alac-text-3)] hover:text-[var(--alac-text)]"
            >
              <span
                aria-hidden="true"
                className="inline-block h-[8px] w-[8px] shrink-0 rounded-[2px]"
                style={{ background: s.color }}
              />
              <span className="readout text-[var(--alac-text-2)]">{n}</span>
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
