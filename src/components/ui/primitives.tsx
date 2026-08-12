import type { ReactNode } from "react";

// Hand rolled primitives, per DESIGN.md. No component library.

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[10px] border border-[var(--line)] bg-[var(--surface)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--line)] px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold leading-[1.35] tracking-[-0.01em]">{title}</h2>
        {sub ? <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">{sub}</p> : null}
      </div>
      {right ? <div className="ml-auto shrink-0">{right}</div> : null}
    </div>
  );
}

/** Status is never colour alone: every tone carries a word. DESIGN.md rule 2. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
    good: "bg-[color-mix(in_oklab,var(--good)_14%,transparent)] text-[var(--good)]",
    warn: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-[var(--warn)]",
    bad: "bg-[color-mix(in_oklab,var(--bad)_14%,transparent)] text-[var(--bad)]",
    brand: "bg-[var(--brand-soft)] text-[var(--brand)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A number that matters, with its label. Tabular so columns align. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color = tone ? `text-[var(--${tone})]` : "text-[var(--ink)]";
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[12px] text-[var(--ink-3)]">{label}</div>
      <div className={`tabular mt-1 text-[26px] font-extrabold leading-none tracking-[-0.025em] ${color}`}>
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[11.5px] text-[var(--ink-3)]">{hint}</div> : null}
    </Card>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
      {children}
    </p>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-[var(--ink-3)]">{body}</p>
    </div>
  );
}

/** A score, sized to read at a glance. Ink, never brand: it is not clickable. */
export function ScoreDot({ score }: { score: number | null }) {
  if (score == null) return <span className="text-[var(--ink-3)]">—</span>;
  const tone = score >= 80 ? "var(--good)" : score >= 60 ? "var(--warn)" : "var(--ink-3)";
  return (
    <span className="tabular inline-flex items-baseline gap-1.5 font-bold" style={{ color: tone }}>
      {score}
    </span>
  );
}

export function formatMoney(value: number | string | null) {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/** Dates render as a fixed ISO-like string so the server and client agree. */
export function formatDate(value: string | Date | null) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function daysAgo(value: string | Date | null) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
