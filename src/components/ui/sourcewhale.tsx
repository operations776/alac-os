import type { DeskRow } from "@/lib/server/queries/desk";

/**
 * SourceWhale state in a list, section 15.2.
 *
 * Loaded and being worked are different facts and the chip says which. The
 * campaign name and contact count travel with it so the badge is
 * explainable, which is the brief's own requirement: never a bare status.
 */
const TONE: Record<string, string> = {
  "Active Campaign": "border-[color-mix(in_oklab,var(--alac-good)_40%,transparent)] bg-[var(--alac-good-soft)] text-[var(--alac-good)]",
  "Positive Reply": "border-[color-mix(in_oklab,var(--alac-purple)_45%,transparent)] bg-[var(--alac-purple-soft)] text-[var(--alac-purple)]",
  Replied: "border-[color-mix(in_oklab,var(--alac-cyan)_40%,transparent)] bg-[var(--alac-cyan-soft)] text-[var(--alac-cyan)]",
  Added: "border-[color-mix(in_oklab,var(--alac-warn)_40%,transparent)] bg-[var(--alac-warn-soft)] text-[var(--alac-warn)]",
  Paused: "border-[color-mix(in_oklab,var(--alac-warn)_40%,transparent)] bg-[var(--alac-warn-soft)] text-[var(--alac-warn)]",
  Completed: "border-[var(--alac-line)] bg-[var(--alac-ground)] text-[var(--alac-text-2)]",
};

const SHORT: Record<string, string> = {
  "Active Campaign": "Active",
  "Positive Reply": "Positive",
  Added: "Added, not active",
};

export function SourceWhaleChip({ row }: { row: DeskRow }) {
  const state = row.sw_state ?? "Not Added";
  if (state === "Not Added") {
    return <span className="text-[12.5px] text-[var(--alac-text-3)]">not added</span>;
  }
  const detail = [row.sw_campaign, row.sw_contacts ? `${row.sw_contacts} contacts` : null]
    .filter(Boolean)
    .join(", ");
  return (
    <span
      className={`placard inline-flex min-h-[24px] items-center rounded-[var(--alac-radius-sm)] border px-2 text-[10px] ${TONE[state] ?? TONE.Completed}`}
      title={detail || state}
    >
      {SHORT[state] ?? state}
    </span>
  );
}
