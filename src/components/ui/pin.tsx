"use client";

import { useActionState, useState } from "react";
import { Pin } from "lucide-react";
import { Dialog } from "./dialog";
import { pinAccount, releasePin } from "@/app/(app)/queue/[id]/pin";

/**
 * The override control. Shows both numbers, always.
 *
 * "Manual #3 / System #17 / Owner Override" is the brief's own example, and
 * the reason it matters is that a pin that hides the system's opinion stops
 * being an override and becomes the only opinion.
 */
export function PinControl({
  accountId,
  systemBand,
  systemRank,
  pinnedBand,
  pinnedRank,
  pinReason,
  pinExpires,
  pinActive,
}: {
  accountId: string;
  systemBand: string | null;
  systemRank: number | null;
  pinnedBand: string | null;
  pinnedRank: number | null;
  pinReason: string | null;
  pinExpires: string | null;
  pinActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(pinAccount, { ok: false });

  const name = (b: string | null) =>
    b === "now" ? "Work now" : b === "next" ? "Up next" : b === "bench" || b === "backlog" ? "Bench" : "Not ranked";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={pinActive ? "Pinned by you. Click to change or release" : "Pin this company to a band"}
        className={
          pinActive
            ? "placard inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[color-mix(in_oklab,var(--alac-accent)_45%,transparent)] bg-[var(--alac-accent-soft)] px-2 text-[10px] text-[var(--alac-accent)]"
            : "placard inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[var(--alac-line)] bg-[var(--alac-ground)] px-2 text-[10px] text-[var(--alac-text-2)] transition-colors hover:border-[var(--alac-accent)] hover:text-[var(--alac-accent)]"
        }
      >
        <Pin size={16} strokeWidth={1.5} />
        {pinActive
          ? `Manual ${pinnedRank ? `#${pinnedRank}` : name(pinnedBand)} · System ${systemRank ? `#${systemRank}` : name(systemBand)}`
          : "Pin"}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Owner override"
        sub={`The system puts this at ${name(systemBand)}${systemRank ? `, rank ${systemRank}` : ""}. Your decision holds until you release it or it expires.`}
      >
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="accountId" value={accountId} />

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Put it in
            <select name="band" defaultValue={pinnedBand ?? systemBand ?? "now"} className="field">
              <option value="now">Work now</option>
              <option value="next">Up next</option>
              <option value="bench">Bench</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Exact rank, optional
            <input
              name="rank"
              type="number"
              min={1}
              max={999}
              defaultValue={pinnedRank ?? ""}
              placeholder="3"
              className="field"
            />
            <span className="text-[12px] text-[var(--alac-text-3)]">
              Leave blank to sit at the top of that band without a fixed position.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Why
            <select name="reason" defaultValue={pinReason ?? ""} className="field">
              <option value="">No reason given</option>
              <option value="Strategic">Strategic</option>
              <option value="Relationship">Relationship</option>
              <option value="Client direction">Client direction</option>
              <option value="Owner judgment">Owner judgment</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Until, optional
            <input name="expires" type="date" defaultValue={pinExpires ?? ""} className="field" />
            <span className="text-[12px] text-[var(--alac-text-3)]">
              After this date the ranking takes over again. The reason stays on record.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Saving" : pinnedBand ? "Update override" : "Pin it"}
            </button>
            {state.ok ? <span className="text-[12.5px] text-[var(--alac-good)]">Saved</span> : null}
            {state.error ? (
              <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
            ) : null}
          </div>
        </form>

        {pinnedBand ? (
          <form action={releasePin} className="mt-3 border-t border-[var(--alac-line)] pt-3">
            <input type="hidden" name="accountId" value={accountId} />
            <button type="submit" className="btn btn-ghost">
              Release override, back to automatic ranking
            </button>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
