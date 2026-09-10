"use client";

import { useState } from "react";
import { EyeOff, Undo2 } from "lucide-react";
import { Dialog } from "./dialog";
import { dismiss, restore } from "@/app/(app)/dismiss";

/**
 * Take one thing off the boards, or put it back.
 *
 * The dialog exists to collect the reason rather than to confirm: the
 * action is reversible, so a confirmation step would be friction over
 * nothing, but a dismissal with no reason is unreadable a month later.
 */
export function Dismiss({
  kind,
  refId,
  label = "Not this one",
  reasons,
}: {
  kind: "signal" | "role";
  refId: string;
  label?: string;
  reasons: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Take this off the boards. It keeps its score and you can put it back"
        aria-label={label}
        className="inline-flex items-center gap-1 text-[var(--alac-text-3)] transition-colors hover:text-[var(--alac-warn)]"
      >
        <EyeOff size={16} strokeWidth={1.5} />
        <span className="text-[11.5px]">{label}</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={kind === "signal" ? "Take this signal off the boards" : "Take this role off the boards"}
        sub="Nothing is deleted. It keeps its score and its history, and you can put it back from the dismissed list."
      >
        <form action={dismiss} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="refId" value={refId} />

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Why
            <select name="reason" defaultValue={reasons[0]} className="field">
              {reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Note, optional
            <input name="note" maxLength={500} className="field" placeholder="Anything the reason does not cover" />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Take it off</button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** One click, no dialog: putting something back needs no reason. */
export function Restore({ kind, refId }: { kind: "signal" | "role"; refId: string }) {
  return (
    <form action={restore} className="inline-flex">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="refId" value={refId} />
      <button
        type="submit"
        title="Put it back on the boards"
        className="inline-flex items-center gap-1 text-[var(--alac-accent)] transition-colors hover:text-[var(--alac-accent-light)]"
      >
        <Undo2 size={16} strokeWidth={1.5} />
        <span className="text-[11.5px]">Put it back</span>
      </button>
    </form>
  );
}
