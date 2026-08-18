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
// Material Design 3. Depth is carried by tonal surfaces rather than by
// borders: a panel separates from the ground because it is a different tone,
// not because a line was drawn around it. Shape carries the rest, and it is
// the most recognisable part of the style: every button and chip is a pill,
// every container is generously rounded.
//
// Control recipes (.btn, .field, .link, .panel, .well, .chip) live in
// globals.css rather than as Tailwind strings here, so the control language
// has one definition and a restyle is one file.

/* -------------------------------------------------------------------------
   Panels
   ---------------------------------------------------------------------- */

/**
 * A tonal container. `interactive` opts into the hover elevation, and should
 * only be set on a panel that is genuinely clickable: a panel that lifts under
 * the cursor is promising a click, so a static one must not.
 */
export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div className={`panel ${interactive ? "panel-interactive" : ""} ${className}`}>
      {children}
    </div>
  );
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
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <h2 className="display text-[15px] leading-[1.35] text-[var(--md-on-surface)]">
          {title}
        </h2>
        {sub ? (
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--md-on-surface-muted)]">
            {sub}
          </p>
        ) : null}
      </div>
      {right ? <div className="ml-auto shrink-0">{right}</div> : null}
    </div>
  );
}

/** Section label above a page or panel title. Material label style. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="placard text-[12px] leading-[1.4] text-[var(--md-primary)]">{children}</p>
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
        <h1 className="display mt-1.5 text-[28px] leading-[1.2] text-[var(--md-on-surface)] sm:text-[32px]">
          {title}
        </h1>
        {lede ? (
          <p className="prose-measure mt-2.5 text-[14px] leading-[1.6] text-[var(--md-on-surface-variant)]">
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
 * primary is the single filled action on a view, secondary is tonal, ghost is
 * text only, and danger always confirms first.
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
 *
 * Drawn as a Material chip: a tonal container with matching on-container text,
 * pill shaped, no border. The container tone is what separates it from the
 * surface, so the outline the previous theme needed is gone.
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
    neutral: "bg-[var(--md-surface-container-low)] text-[var(--md-on-surface-variant)]",
    good: "bg-[var(--md-success-container)] text-[var(--md-success)]",
    warn: "bg-[var(--md-warning-container)] text-[var(--md-warning)]",
    bad: "bg-[var(--md-error-container)] text-[var(--md-error)]",
    brand: "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]",
  };
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`placard inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] leading-none ${tones[tone]}`}
    >
      {withIcon ? <Icon size={16} strokeWidth={1.5} className="shrink-0" /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
   The meter
   ---------------------------------------------------------------------- */

/**
 * A linear meter: a rounded tonal track with a rounded primary fill.
 *
 * This replaced a ruled tick scale when the product moved to Material 3. The
 * graduations and the hard index mark went with it: MD3 progress indicators
 * are smooth, and a ruled instrument face is the visual language of the
 * previous theme rather than this one.
 *
 * It is presentational only and never the sole carrier of a value: the number
 * itself is always printed next to it, which is what makes dropping the
 * graduations safe. It appears at three sizes: inline beside a score, as a
 * component gauge on the account page, and stacked into the score ladder.
 */
export function Meter({
  value,
  max,
  tone = "primary",
  height = 8,
  className = "",
}: {
  value: number;
  max: number;
  tone?: "primary" | "tertiary" | "bad" | "ink";
  height?: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const color =
    tone === "primary"
      ? "var(--md-primary)"
      : tone === "tertiary"
        ? "var(--md-tertiary)"
        : tone === "bad"
          ? "var(--md-error)"
          : "var(--md-on-surface-variant)";

  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-hidden rounded-full bg-[var(--md-surface-container-low)] ${className}`}
      style={{ height }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/**
 * A single component gauge: label, meter, and the reading. Used for the five
 * score components and for the tier distribution.
 */
export function GaugeRow({
  label,
  value,
  max,
  display,
  tone = "primary",
}: {
  label: ReactNode;
  value: number;
  max: number;
  display?: ReactNode;
  tone?: "primary" | "tertiary" | "bad" | "ink";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--md-on-surface-variant)]">{label}</span>
        <span className="readout shrink-0 text-[13px] text-[var(--md-primary)]">
          {display ?? (
            <>
              {value}
              <span className="text-[var(--md-on-surface-muted)]"> / {max}</span>
            </>
          )}
        </span>
      </div>
      <Meter value={value} max={max} tone={tone} height={8} />
    </div>
  );
}

/* -------------------------------------------------------------------------
   Readouts
   ---------------------------------------------------------------------- */

/**
 * A measured number with its label, in a tonal card.
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
    tone === "good"
      ? "var(--md-success)"
      : tone === "warn"
        ? "var(--md-warning)"
        : tone === "bad"
          ? "var(--md-error)"
          : "var(--md-primary)";
  return (
    <div className="panel px-5 py-4">
      <div className="placard text-[12px] text-[var(--md-on-surface-variant)]">{label}</div>
      <div className="readout mt-2 text-[30px] leading-none" style={{ color }}>
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[12px] leading-snug text-[var(--md-on-surface-muted)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A score as it appears in a list or table. The band drives the treatment: a
 * high score sits in a primary container pill, a mid score is plain, and a low
 * one is muted, so a column of scores reads at a glance. The band is always
 * stated in the title, so the treatment is never the only signal.
 */
export function ScoreDot({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="readout text-[var(--md-on-surface-muted)]" title="Not scored">
        &ndash;&ndash;
      </span>
    );
  }
  const band = score >= 80 ? "high" : score >= 60 ? "mid" : "low";
  if (band === "high") {
    return (
      <span
        className="readout inline-flex min-w-[38px] items-center justify-center rounded-full bg-[var(--md-primary-container)] px-2.5 py-0.5 text-[13px] text-[var(--md-on-primary-container)]"
        title={`Score ${score} of 100, high band`}
      >
        {score}
      </span>
    );
  }
  return (
    <span
      className="readout text-[13px]"
      style={{
        color: band === "mid" ? "var(--md-on-surface)" : "var(--md-on-surface-muted)",
      }}
      title={`Score ${score} of 100, ${band} band`}
    >
      {score}
    </span>
  );
}

/**
 * The primary score readout on the account page. Its size is its emphasis: a
 * 46px number in a primary container, with the meter beneath it.
 */
export function ScoreReadout({ score }: { score: number | null }) {
  const scored = score != null;
  return (
    <div
      className={`w-[196px] rounded-[var(--md-radius-lg)] px-5 pb-5 pt-4 shadow-[var(--md-elev-1)] ${
        scored
          ? "bg-[var(--md-primary-container)]"
          : "bg-[var(--md-surface-container)]"
      }`}
    >
      <div
        className={`placard text-[12px] ${
          scored
            ? "text-[var(--md-on-primary-container)]"
            : "text-[var(--md-on-surface-variant)]"
        }`}
      >
        Composite score
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="readout text-[46px] leading-none"
          style={{
            color: scored ? "var(--md-on-primary-container)" : "var(--md-on-surface-muted)",
          }}
        >
          {score ?? "--"}
        </span>
        <span
          className="readout text-[14px]"
          style={{
            color: scored
              ? "color-mix(in oklab, var(--md-on-primary-container) 70%, transparent)"
              : "var(--md-on-surface-muted)",
          }}
        >
          / 100
        </span>
      </div>
      <div className="mt-4">
        <div
          aria-hidden="true"
          className="relative h-2 w-full overflow-hidden rounded-full"
          style={{
            background: scored
              ? "color-mix(in oklab, var(--md-on-primary-container) 16%, transparent)"
              : "var(--md-surface-container-low)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, score ?? 0))}%`,
              background: scored ? "var(--md-primary)" : "var(--md-on-surface-muted)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Tables
   ---------------------------------------------------------------------- */

/**
 * A table column header. `align` exists because numbers are right aligned and
 * their heading must follow them. Contract rule 9.
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
      className={`placard whitespace-nowrap px-4 py-3 text-[12px] text-[var(--md-on-surface-variant)] ${
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
    <span className="readout text-[var(--md-on-surface-muted)]" title={label}>
      &ndash;&ndash;
    </span>
  );
}

/* -------------------------------------------------------------------------
   Empty and error states
   ---------------------------------------------------------------------- */

/**
 * Empty states say what would be here, why it is not, and what fills it.
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
    <div className="px-5 py-14">
      <div className="mx-auto max-w-[54ch] text-center">
        <p className="display text-[17px] text-[var(--md-on-surface)]">{title}</p>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--md-on-surface-variant)]">
          {body}
        </p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * A stated limitation, rendered as a tonal annotation rather than hidden. Used
 * where the product knows something is unavailable and says so.
 */
export function NoticeLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-warning-container)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--md-on-surface)]">
      <span className="mt-[1px] shrink-0 text-[var(--md-warning)]">
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
