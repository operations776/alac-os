import type { ComponentProps, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  XCircle,
} from "lucide-react";

// Hand rolled primitives, per DESIGN.md. No component library.
//
// All atmosphere lives in the background. These components are deliberately
// plain: square panels with one hairline, grey text, and exactly two accent
// colours doing semantic work. Green means interactive, cyan means the engine
// computed this number. Nothing here glows, is cut, or moves.
//
// Control recipes (.btn, .field, .link, .panel, .well) live in globals.css
// rather than as Tailwind strings here, so the control language has one
// definition and a restyle is one file.

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
 * A panel header. Title, optional sub line, optional action. A panel that
 * matters more than its neighbour says so with its heading and its position
 * on the page, never with an accent bar or a ring.
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
    // flex-wrap so the right slot drops below the title on a phone instead of
    // squeezing the heading into a two line column beside it.
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b border-[var(--line)] px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="display text-[13px] leading-[1.4]">{title}</h2>
        {sub ? (
          <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--ink-3)]">{sub}</p>
        ) : null}
      </div>
      {right ? <div className="ml-auto shrink-0">{right}</div> : null}
    </div>
  );
}

/** Section label in the placard face, above a page or panel title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="placard text-[10px] leading-[1.4] text-[var(--ink-3)]">{children}</p>
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
    <header className="mb-7 flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-2.5 text-[26px] leading-[1.12] sm:text-[32px]">{title}</h1>
        {lede ? (
          <p className="prose-measure mt-3 text-[13px] leading-[1.65] text-[var(--ink-2)]">
            {lede}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------
   Controls
   ---------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * The one button in the product. Variants map to intent, not to appetite:
 * primary is the single action on a view, danger always confirms first.
 */
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

/** The same recipe for an element that navigates rather than acts. */
export function ButtonLink({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  return <a className={`btn btn-${variant} ${className}`} {...props} />;
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
 * DESIGN.md contract rule 7.
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
    neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
    good: "bg-[color-mix(in_oklab,var(--good)_14%,transparent)] text-[var(--good)]",
    warn: "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-[var(--warn)]",
    bad: "bg-[color-mix(in_oklab,var(--bad)_14%,transparent)] text-[var(--bad)]",
    brand: "bg-[var(--brand-soft)] text-[var(--brand)]",
  };
  const borders: Record<Tone, string> = {
    neutral: "var(--line-strong)",
    good: "color-mix(in oklab, var(--good) 55%, transparent)",
    warn: "color-mix(in oklab, var(--warn) 55%, transparent)",
    bad: "color-mix(in oklab, var(--bad) 55%, transparent)",
    brand: "color-mix(in oklab, var(--brand) 55%, transparent)",
  };
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`placard inline-flex items-center gap-1.5 border px-2.5 py-[5px] text-[9.5px] leading-none ${tones[tone]}`}
      style={{ borderColor: borders[tone] }}
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
 * A linear tick scale: ruled graduations, a filled travel, and a hard index
 * mark at the reading. A data graphic, so it keeps its colour, but it does
 * not glow: the mark is a 2px rule, not a light source.
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
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height }}
    >
      {/* The empty travel, recessed. */}
      <div className="absolute inset-0 border border-[var(--line)] bg-[var(--surface-2)]" />

      {/* Graduations across the full travel. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklab, var(--ink) 20%, transparent) 0 1px, transparent 1px ${100 / Math.max(ticks, 1)}%)`,
        }}
      />

      {/* The filled travel. Flat fill, no gradient: a gradient would imply a
          value that is not there. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          background: `color-mix(in oklab, ${color} 26%, transparent)`,
        }}
      />

      {/* The index mark: the exact reading, drawn hard against the travel. */}
      {pct > 0 ? (
        <div
          className="absolute inset-y-0 w-[2px]"
          style={{
            left: `calc(${pct}% - ${pct >= 100 ? 2 : 1}px)`,
            background: color,
          }}
        />
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
        <span className="text-[12px] text-[var(--ink-2)]">{label}</span>
        <span className="readout shrink-0 text-[12.5px] text-[var(--readout)]">
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
 * A measured number with its placard label. Cyan by default, because every
 * value in this row is something the engine counted.
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
  const color = tone && tone !== "readout" ? `var(--${tone})` : "var(--readout)";
  return (
    <div className="panel relative overflow-hidden px-4 py-3.5">
      <div className="placard text-[9.5px] text-[var(--ink-3)]">{label}</div>
      <div className="readout mt-2 text-[28px] leading-none" style={{ color }}>
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[11px] leading-snug text-[var(--ink-3)]">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * A score as it appears in a list or table. The band drives brightness rather
 * than hue: a high score reads bright cyan, a low one sits dim, so a column of
 * scores reads as one instrument at different intensities instead of a traffic
 * light. The band is always stated in the title, so brightness is never the
 * only signal.
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
    band === "high"
      ? "var(--readout)"
      : band === "mid"
        ? "var(--ink)"
        : "var(--ink-3)";
  return (
    <span
      className="readout text-[13.5px]"
      style={{ color }}
      title={`Score ${score} of 100, ${band} band`}
    >
      {score}
    </span>
  );
}

/**
 * The primary score readout on the account page. Its size is its emphasis: a
 * 46px number in a plain panel, with the scale beneath it.
 */
export function ScoreReadout({ score }: { score: number | null }) {
  return (
    <div className="panel w-[196px] px-4 pb-4 pt-3.5">
      <div className="placard text-[9.5px] text-[var(--ink-3)]">Composite score</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="readout text-[46px] leading-none"
          style={{ color: score == null ? "var(--ink-3)" : "var(--readout)" }}
        >
          {score ?? "--"}
        </span>
        <span className="readout text-[13px] text-[var(--ink-3)]">/ 100</span>
      </div>
      <div className="mt-3.5">
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
 * are right aligned and their heading must follow them. Contract rule 9.
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
      className={`placard whitespace-nowrap px-4 py-3 text-[9.5px] text-[var(--ink-3)] ${
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
 * Empty states say what would be here, why it is not, and what fills it. They
 * are drawn as a stalled terminal rather than a friendly illustration: the
 * prompt printed a status line and stopped. No blinking cursor, because a
 * blinking cursor is an animation sitting in a block of text.
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
    <div className="px-5 py-12">
      <div className="mx-auto max-w-[54ch]">
        <p className="placard text-[10.5px] text-[var(--ink-2)]">{title}</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">{body}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * A stated limitation, rendered as a panel annotation rather than hidden.
 * Used where the product knows something is unavailable and says so.
 */
export function NoticeLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
      <span className="mt-[1px] shrink-0 text-[var(--warn)]">
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
