import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  XCircle,
} from "lucide-react";

// Hand rolled primitives, per DESIGN.md. No component library.
//
// The visual language is flight instrumentation. A card is a panel with a
// milled bezel edge, a label is a silkscreened placard, and a number the
// engine computed is a readout in the sodium amber reserved for measured
// quantities. Nothing that is not measured borrows that colour.

/* -------------------------------------------------------------------------
   Panels
   ---------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel ${className}`}>{children}</div>;
}

/**
 * A panel header. The rule beneath it is doubled: a hard line plus a hairline
 * of the same colour at low alpha, which is how a bezel meets a panel face.
 */
export function CardHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--line)] px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-[1.35] tracking-[-0.005em] text-balance">
          {title}
        </h2>
        {sub ? <p className="mt-1 text-[12px] text-[var(--ink-3)]">{sub}</p> : null}
      </div>
      {right ? <div className="ml-auto shrink-0">{right}</div> : null}
    </div>
  );
}

/**
 * Section label in the placard face. Condensed, spaced, uppercase: the label
 * language of a physical instrument panel.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="placard text-[10.5px] leading-[1.4] text-[var(--ink-3)]">{children}</p>
  );
}

/**
 * A page heading block. Every screen opens the same way so the operator always
 * knows where the title, the context line, and the actions will be.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  right,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-balance">
          {title}
        </h1>
        {lede ? (
          <p className="prose-measure mt-2 text-[14px] leading-[1.55] text-[var(--ink-2)]">
            {lede}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------
   Status
   ---------------------------------------------------------------------- */

const TONE_ICON = {
  neutral: CircleDashed,
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  brand: Info,
} as const;

export type Tone = keyof typeof TONE_ICON;

/**
 * Status is never colour alone: every tone carries a word, and `withIcon`
 * adds the third channel for the states where colour is doing real work.
 * DESIGN.md rule 2.
 */
export function Badge({
  tone = "neutral",
  withIcon = false,
  children,
}: {
  tone?: Tone;
  withIcon?: boolean;
  children: ReactNode;
}) {
  const tones: Record<Tone, string> = {
    neutral:
      "bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--line-strong)]",
    good: "bg-[color-mix(in_oklab,var(--good)_12%,transparent)] text-[var(--good)] border-[color-mix(in_oklab,var(--good)_35%,transparent)]",
    warn: "bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-[var(--warn)] border-[color-mix(in_oklab,var(--warn)_35%,transparent)]",
    bad: "bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] text-[var(--bad)] border-[color-mix(in_oklab,var(--bad)_35%,transparent)]",
    brand:
      "bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand-line)]",
  };
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold ${tones[tone]}`}
    >
      {withIcon ? <Icon size={16} strokeWidth={1.5} className="shrink-0" /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
   The signature element: the tick scale
   ---------------------------------------------------------------------- */

/**
 * A linear tick scale, the way a value is drawn on an instrument: ruled
 * graduations, a filled travel, and an index mark at the reading.
 *
 * This is the app's one repeated visual idea. It replaces every rounded
 * progress bar in the product, and it appears at three sizes: inline beside a
 * score, as a component gauge on the account page, and stacked into the score
 * ladder that carries the full arithmetic.
 *
 * It is presentational only and never the sole carrier of a value: the number
 * itself is always printed next to it.
 */
export function TickScale({
  value,
  max,
  ticks = 5,
  tone = "readout",
  height = 22,
  className = "",
}: {
  value: number;
  max: number;
  ticks?: number;
  tone?: "readout" | "brand" | "bad" | "ink";
  height?: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const color =
    tone === "readout"
      ? "var(--readout)"
      : tone === "brand"
        ? "var(--brand)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--ink-2)";

  // Graduations are drawn as a repeating gradient rather than elements, so a
  // 14 row ladder does not mount 100 extra nodes.
  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-hidden rounded-[2px] ${className}`}
      style={{ height }}
    >
      {/* The unlit travel, recessed. */}
      <div className="absolute inset-0 bg-[var(--surface-2)] shadow-[inset_0_1px_0_rgb(0_0_0/0.28)]" />

      {/* Graduations across the full travel. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklab, var(--ink) 22%, transparent) 0 1px, transparent 1px ${100 / Math.max(ticks, 1)}%)`,
        }}
      />

      {/* The lit travel. Flat fill, no gradient: a gradient would imply a
          value that is not there. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          background: `color-mix(in oklab, ${color} 30%, transparent)`,
          borderRight: pct > 0 && pct < 100 ? `1.5px solid ${color}` : "none",
        }}
      />

      {/* The index mark: the exact reading, drawn hard against the travel. */}
      {pct >= 100 ? (
        <div className="absolute inset-y-0 right-0 w-[1.5px]" style={{ background: color }} />
      ) : null}
    </div>
  );
}

/**
 * A single component gauge: label, tick scale, and the reading in the readout
 * face. Used for the five score components and for the tier distribution.
 */
export function GaugeRow({
  label,
  value,
  max,
  display,
  tone = "readout",
  ticks,
}: {
  label: ReactNode;
  value: number;
  max: number;
  display?: ReactNode;
  tone?: "readout" | "brand" | "bad" | "ink";
  ticks?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--ink-2)]">{label}</span>
        <span className="readout shrink-0 text-[13px] font-medium text-[var(--ink)]">
          {display ?? (
            <>
              {value}
              <span className="text-[var(--ink-3)]"> / {max}</span>
            </>
          )}
        </span>
      </div>
      <TickScale value={value} max={max} tone={tone} ticks={ticks} height={10} />
    </div>
  );
}

/* -------------------------------------------------------------------------
   Readouts
   ---------------------------------------------------------------------- */

/**
 * A measured number with its placard label. The value takes the readout face
 * and, when it is a live count the engine produced, the readout colour.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "readout";
}) {
  const color =
    tone === "readout"
      ? "var(--readout)"
      : tone
        ? `var(--${tone})`
        : "var(--ink)";
  return (
    <div className="panel relative overflow-hidden px-4 py-3.5">
      <div className="placard text-[10px] text-[var(--ink-3)]">{label}</div>
      <div
        className="readout mt-1.5 text-[26px] font-medium leading-none tracking-[-0.03em]"
        style={{ color }}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 text-[11.5px] leading-snug text-[var(--ink-3)]">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * A score as it appears in a list or table. Ink by default; the readout amber
 * marks the band worth acting on, and the band is always stated in the title
 * so the colour is never the only signal.
 */
export function ScoreDot({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="readout text-[var(--ink-3)]" title="Not scored">
        &ndash;&ndash;
      </span>
    );
  }
  const band = score >= 80 ? "high" : score >= 60 ? "mid" : "low";
  const color =
    band === "high" ? "var(--readout)" : band === "mid" ? "var(--ink)" : "var(--ink-3)";
  return (
    <span
      className="readout text-[14px] font-medium"
      style={{ color }}
      title={`Score ${score} of 100, ${band} band`}
    >
      {score}
    </span>
  );
}

/**
 * The primary score readout on the account page. Large, in the readout face,
 * with its scale beneath it and a single sweep on load.
 */
export function ScoreReadout({ score }: { score: number | null }) {
  return (
    <div className="panel relative w-[186px] overflow-hidden px-4 pb-3.5 pt-3">
      <div className="sweep-line" />
      <div className="placard text-[10px] text-[var(--ink-3)]">Composite score</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="readout text-[44px] font-medium leading-none tracking-[-0.04em]"
          style={{ color: score == null ? "var(--ink-3)" : "var(--readout)" }}
        >
          {score ?? "--"}
        </span>
        <span className="readout text-[14px] text-[var(--ink-3)]">/ 100</span>
      </div>
      <div className="mt-3">
        <TickScale value={score ?? 0} max={100} ticks={10} height={8} />
      </div>
      <div className="placard mt-2 flex justify-between text-[9px] text-[var(--ink-3)]">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Tables
   ---------------------------------------------------------------------- */

/**
 * A table column header in the placard face. `align` exists because numbers
 * are right aligned and their heading must follow them. Contract rule 5.
 */
export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`placard whitespace-nowrap px-4 py-2.5 text-[10px] text-[var(--ink-3)] ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

/** A value that is genuinely absent. Never a zero dressed up as one. */
export function Blank({ label = "no data" }: { label?: string }) {
  return (
    <span className="readout text-[var(--ink-3)]" title={label}>
      &ndash;&ndash;
    </span>
  );
}

/* -------------------------------------------------------------------------
   Empty and error states
   ---------------------------------------------------------------------- */

/**
 * Empty states say what would be here, why it is not, and what fills it.
 * They are never decorative: an honest gap stays a gap.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <span className="text-[var(--ink-3)]">
        <CircleDashed size={20} strokeWidth={1.5} />
      </span>
      <p className="mt-3 text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-[var(--ink-3)]">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * A stated limitation, rendered as a panel annotation rather than hidden.
 * Used where the product knows something is unavailable and says so.
 */
export function NoticeLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
      <span className="mt-[1px] shrink-0">
        <Info size={16} strokeWidth={1.5} />
      </span>
      <span className="prose-measure">{children}</span>
    </p>
  );
}

/* -------------------------------------------------------------------------
   Formatting
   ---------------------------------------------------------------------- */

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
