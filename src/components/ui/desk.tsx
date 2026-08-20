import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Meter, type Tone } from "./primitives";
import { PRIORITY_LABEL, type Motion, type PrepStatus, type Priority } from "@/lib/server/queries/desk";

/**
 * Shared desk chrome. These render the workbook's own vocabulary, so the
 * mapping from a dropdown value to a colour lives here once rather than in
 * every screen that shows a status.
 */

/* -------------------------------------------------------------------------
   Status chips
   ---------------------------------------------------------------------- */

/**
 * Prep status. The tones follow what each stage asks of the operator rather
 * than "progress": READY FOR QC is the only one that is a request for Adrian's
 * decision, so it is the only one that draws attention.
 */
const PREP_TONE: Record<PrepStatus, Tone> = {
  "NOT STARTED": "neutral",
  "IN RESEARCH": "neutral",
  "READY FOR QC": "brand",
  APPROVED: "good",
  HOLD: "warn",
};

export function PrepChip({ status }: { status: PrepStatus }) {
  return <Badge tone={PREP_TONE[status] ?? "neutral"}>{status}</Badge>;
}

/**
 * Recommended motion. TBD is deliberately muted: the instructions say an
 * account cannot reach READY FOR QC while its motion is TBD, so TBD is an
 * absence of a decision, not a decision.
 */
const MOTION_TONE: Record<Motion, Tone> = {
  TBD: "neutral",
  "LIVE LEAD": "good",
  "GENERAL BD": "brand",
  "MPC WEDGE": "brand",
  NURTURE: "neutral",
  HOLD: "warn",
};

export function MotionChip({ motion }: { motion: Motion }) {
  if (motion === "TBD") {
    return <span className="text-[12.5px] text-[var(--md-on-surface-muted)]">TBD</span>;
  }
  return <Badge tone={MOTION_TONE[motion] ?? "neutral"}>{motion}</Badge>;
}

/** Priority. Source data from the TAM, never set in this app. */
export function PriorityChip({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-[12.5px] text-[var(--md-on-surface-muted)]">--</span>;
  if (priority === "unscored") {
    return <Badge tone="warn">UNSCORED</Badge>;
  }
  const tone: Tone = priority === "priority_1" ? "brand" : "neutral";
  return <Badge tone={tone}>{PRIORITY_LABEL[priority]}</Badge>;
}

/**
 * The two execution layers, shown together and in order. They are separate
 * columns in the workbook because LinkedIn warming happens before the BD
 * sequence, so showing them as one status would lose the ordering.
 */
export function ExecutionStages({
  heyreach,
  sourcewhale,
}: {
  heyreach: string;
  sourcewhale: string;
}) {
  const live = (s: string) => s !== "NOT LOADED";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        title={`HeyReach: ${heyreach}`}
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          live(heyreach)
            ? "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]"
            : "bg-[var(--md-surface-container-low)] text-[var(--md-on-surface-muted)]"
        }`}
      >
        HR
      </span>
      <span aria-hidden="true" className="text-[var(--md-on-surface-muted)]">
        &rsaquo;
      </span>
      <span
        title={`SourceWhale: ${sourcewhale}`}
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          live(sourcewhale)
            ? "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]"
            : "bg-[var(--md-surface-container-low)] text-[var(--md-on-surface-muted)]"
        }`}
      >
        SW
      </span>
      <span className="sr-only">
        HeyReach {heyreach}, then SourceWhale {sourcewhale}
      </span>
    </span>
  );
}

/**
 * The Final Score as it appears in a list. It is source data, so it is printed
 * plainly: no band colouring, because a colour here would imply the app has an
 * opinion about a number it does not own.
 */
export function ScoreCell({ score }: { score: string | null }) {
  if (score == null) {
    return (
      <span className="readout text-[var(--md-on-surface-muted)]" title="Not scored">
        &ndash;&ndash;
      </span>
    );
  }
  return <span className="readout text-[13.5px]">{Math.round(Number(score))}</span>;
}

/** A link to a battlecard or a saved search, or an honest gap. */
export function LinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="text-[12.5px] text-[var(--md-on-surface-muted)]" title={`No ${label} yet`}>
        &ndash;&ndash;
      </span>
    );
  }
  // The workbook stores some of these as the literal text "LINK" or "TL LINK"
  // rather than a URL, a placeholder from the sheet's own formatting. Those are
  // shown as present but not made clickable, because there is nothing to open.
  const isUrl = /^https?:\/\//i.test(href);
  if (!isUrl) {
    return (
      <span
        className="chip min-h-[24px] px-2.5 text-[11px]"
        title={`Marked present in the workbook as "${href}", with no URL`}
      >
        {label}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link text-[12.5px] font-medium">
      {label}
    </a>
  );
}

/* -------------------------------------------------------------------------
   Heat
   ---------------------------------------------------------------------- */

/**
 * The six heat components and their ceilings, in the order the scoring model
 * lists them. The ceilings live here and in the database check constraints,
 * and the two must agree.
 */
export const HEAT_COMPONENTS = [
  { key: "hiring_urgency", label: "Hiring urgency", max: 30 },
  { key: "icp_fit", label: "ICP fit", max: 20 },
  { key: "capital", label: "Capital", max: 15 },
  { key: "talent_scarcity", label: "Talent scarcity", max: 15 },
  { key: "access", label: "Access", max: 10 },
  { key: "freshness", label: "Freshness", max: 10 },
] as const;

/**
 * Heat against the TAM score. This is the number the desk acts on: a positive
 * delta means something just happened that makes the account more urgent than
 * its standing qualification says.
 */
export function HeatDelta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span
        className="text-[12.5px] text-[var(--md-on-surface-muted)]"
        title="No TAM score to compare against, this company is not in the scored TAM"
      >
        no TAM score
      </span>
    );
  }
  const hotter = delta > 0;
  return (
    <span
      className={`readout inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] ${
        hotter
          ? "bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]"
          : "bg-[var(--md-surface-container-low)] text-[var(--md-on-surface-variant)]"
      }`}
      title={
        hotter
          ? `Heat is ${delta} points above this account's TAM score`
          : `Heat is ${Math.abs(delta)} points below this account's TAM score`
      }
    >
      {hotter ? "+" : ""}
      {delta}
    </span>
  );
}

/** The heat score with its meter, for a list row. */
export function HeatScore({ score }: { score: number | null }) {
  if (score == null) return <span className="readout text-[var(--md-on-surface-muted)]">--</span>;
  return (
    <div className="flex items-center gap-2.5">
      <span className="readout w-7 shrink-0 text-right text-[14px] text-[var(--md-primary)]">
        {score}
      </span>
      <span className="w-[72px] shrink-0">
        <Meter value={score} max={100} height={6} />
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Layout
   ---------------------------------------------------------------------- */

/** A labelled block on the board, with an optional count and a link out. */
export function BoardSection({
  title,
  sub,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  sub?: ReactNode;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="display text-[15px] text-[var(--md-on-surface)]">{title}</h2>
        {sub ? (
          <span className="text-[12.5px] text-[var(--md-on-surface-muted)]">{sub}</span>
        ) : null}
        {href ? (
          <Link href={href} className="link ml-auto text-[12.5px] font-medium text-[var(--md-primary)]">
            {hrefLabel ?? "Open"}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
