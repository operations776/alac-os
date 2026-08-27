import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Meter, type Tone } from "./primitives";
import { PRIORITY_LABEL, type DeskRow, type Motion, type PrepStatus, type Priority } from "@/lib/server/queries/desk";
import { nextMove, lifecycle } from "@/lib/scoring/next-move.mjs";

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

/**
 * Where the research has got to. Keys are the database enum, labels are what
 * the reader sees. "QC" was quality control, which is only obvious to whoever
 * named the column.
 */
const PREP_LABEL: Record<PrepStatus, string> = {
  "NOT STARTED": "Not started",
  "IN RESEARCH": "Being researched",
  "READY FOR QC": "Needs review",
  APPROVED: "Approved",
  HOLD: "On hold",
};

export function PrepChip({ status }: { status: PrepStatus }) {
  return <Badge tone={PREP_TONE[status] ?? "neutral"}>{PREP_LABEL[status] ?? status}</Badge>;
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

/**
 * How the account gets approached, in words rather than desk shorthand.
 *
 * The keys are a database enum and are matched on in filters, so they are
 * never rewritten. Only the label the reader sees changes. "MPC" is Most
 * Placeable Candidate, which is trade language: leading with a specific person
 * rather than with the agency.
 */
const MOTION_LABEL: Record<Motion, string> = {
  TBD: "Not decided",
  "LIVE LEAD": "Live lead",
  "GENERAL BD": "New business",
  "MPC WEDGE": "Lead with a candidate",
  NURTURE: "Nurture",
  HOLD: "On hold",
};

export function MotionChip({ motion }: { motion: Motion }) {
  if (motion === "TBD") {
    return (
      <span className="text-[12.5px] text-[var(--alac-text-3)]" title="No approach chosen yet">
        {MOTION_LABEL.TBD}
      </span>
    );
  }
  return <Badge tone={MOTION_TONE[motion] ?? "neutral"}>{MOTION_LABEL[motion] ?? motion}</Badge>;
}

/** Priority. Source data from the TAM, never set in this app. */
export function PriorityChip({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="text-[12.5px] text-[var(--alac-text-3)]">--</span>;
  if (priority === "unscored") {
    return <Badge tone="warn">UNSCORED</Badge>;
  }
  const tone: Tone = priority === "priority_1" ? "brand" : "neutral";
  return <Badge tone={tone}>{PRIORITY_LABEL[priority]}</Badge>;
}

/**
 * The two outreach steps, shown together and in order.
 *
 * They are separate columns in the workbook because LinkedIn warming happens
 * before the email sequence, so collapsing them into one status would lose the
 * ordering that matters.
 *
 * Labelled "LinkedIn" and "Email" rather than by tool name. The tools are
 * HeyReach and SourceWhale, and their initials were "HR" and "SW", which meant
 * nothing to a reader and, worse, read as the company's own name: ALAC HR
 * Solutions. The tool is an implementation detail of the step.
 */
export function ExecutionStages({
  heyreach,
  sourcewhale,
}: {
  heyreach: string;
  sourcewhale: string;
}) {
  const live = (s: string) => s !== "NOT LOADED";
  const chip = (on: boolean) =>
    `rounded-[var(--alac-radius-sm)] px-2 py-0.5 text-[11px] font-medium ${
      on
        ? "bg-[var(--alac-surface-2)] text-[var(--alac-text-2)]"
        : "bg-[var(--alac-ground)] text-[var(--alac-text-3)]"
    }`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        title={`LinkedIn, in HeyReach: ${live(heyreach) ? heyreach : "not loaded yet"}`}
        className={chip(live(heyreach))}
      >
        LinkedIn
      </span>
      <span aria-hidden="true" className="text-[var(--alac-text-3)]">
        &rsaquo;
      </span>
      <span
        title={`Email, in SourceWhale: ${live(sourcewhale) ? sourcewhale : "not loaded yet"}`}
        className={chip(live(sourcewhale))}
      >
        Email
      </span>
      <span className="sr-only">
        LinkedIn {heyreach}, then email {sourcewhale}
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
      <span className="readout text-[var(--alac-text-3)]" title="Not scored">
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
      <span className="text-[12.5px] text-[var(--alac-text-3)]" title={`No ${label} yet`}>
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
        className="text-[12.5px] text-[var(--alac-text-3)]"
        title="No TAM score to compare against, this company is not in the scored TAM"
      >
        no TAM score
      </span>
    );
  }
  const hotter = delta > 0;
  return (
    <span
      className={`readout inline-flex items-center rounded-[var(--alac-radius-sm)] px-2.5 py-0.5 text-[12.5px] ${
        hotter
          ? "bg-[var(--alac-accent-soft)] text-[var(--alac-accent-light)]"
          : "bg-[var(--alac-ground)] text-[var(--alac-text-2)]"
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
  if (score == null) return <span className="readout text-[var(--alac-text-3)]">--</span>;
  return (
    <div className="flex items-center gap-2.5">
      <span className="readout w-7 shrink-0 text-right text-[14px] text-[var(--alac-accent)]">
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
        <h2 className="display text-[15px] text-[var(--alac-text)]">{title}</h2>
        {sub ? (
          <span className="text-[12.5px] text-[var(--alac-text-3)]">{sub}</span>
        ) : null}
        {href ? (
          <Link href={href} className="link ml-auto text-[12.5px] font-medium text-[var(--alac-accent)]">
            {hrefLabel ?? "Open"}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------
   The next move and the lifecycle stage
   ---------------------------------------------------------------------- */

const MOVE_TONE: Record<string, Tone> = { call: "good", prepare: "brand", wait: "neutral" };

/**
 * One instruction per company, the same everywhere it appears.
 *
 * Computed, not stored, from the desk row, so the board, the target list and
 * the account page cannot disagree about what to do next.
 */
export function NextMove({ row, compact }: { row: DeskRow; compact?: boolean }) {
  const m = nextMove(row);
  return (
    <span className={compact ? "inline-flex min-w-0 items-baseline gap-2" : "flex flex-col gap-1"}>
      <span className="inline-flex shrink-0 items-center gap-2">
        <Badge tone={MOVE_TONE[m.kind] ?? "neutral"}>
          {m.kind === "call" ? "Reach out" : m.kind === "wait" ? "Wait" : "Prepare"}
        </Badge>
        <span className="text-[13.5px] font-medium text-[var(--alac-text)]">{m.move}</span>
      </span>
      {compact ? null : (
        <span className="text-[12.5px] leading-snug text-[var(--alac-text-2)]">{m.why}</span>
      )}
    </span>
  );
}

const STAGE_TONE: Record<string, Tone> = {
  "Needs review": "brand",
  Approved: "good",
  "LinkedIn warming": "good",
  "In sequence": "good",
  "On hold": "warn",
};

/** Where the company is in its life, from research through to sequence. */
export function LifecycleChip({
  row,
}: {
  row: Pick<DeskRow, "prep_status" | "heyreach_stage" | "sourcewhale_stage">;
}) {
  const stage = lifecycle(row);
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"}>{stage}</Badge>;
}
