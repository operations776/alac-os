import { Pin } from "lucide-react";
import type { DeskRow } from "@/lib/server/queries/desk";

/**
 * The band, in a list. When the owner has pinned it, both numbers show.
 *
 * "Manual #3 / System #17" is the brief's own phrasing, and the reason both
 * appear is that a pin which hides the system's opinion stops being an
 * override and becomes the only opinion.
 */
export function PinBadge({ row }: { row: DeskRow }) {
  const name = (b: string | null) =>
    b === "now" ? "Work now" : b === "next" ? "Up next" : b === "backlog" || b === "bench" ? "Bench" : "Not ranked";

  if (!row.pin_active) {
    return (
      <span className="text-[12.5px] text-[var(--alac-text-3)]" title="Ranked automatically">
        {name(row.work_band)}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`Owner override${row.pin_reason ? `: ${row.pin_reason}` : ""}${row.pin_expires ? `, until ${row.pin_expires}` : ""}. The system would put this in ${name(row.work_band)}.`}
    >
      <Pin size={16} strokeWidth={1.5} className="shrink-0 text-[var(--alac-accent)]" />
      <span className="readout text-[12.5px] text-[var(--alac-accent)]">
        {row.pinned_rank ? `#${row.pinned_rank}` : name(row.pinned_band)}
      </span>
      <span className="readout text-[11.5px] text-[var(--alac-text-3)]">
        sys {name(row.work_band)}
      </span>
    </span>
  );
}
