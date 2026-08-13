"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { approve, reject } from "./actions";

/**
 * Approve is one click. Rejecting opens a note field, because the note is the
 * part with long term value: phase 3 feeds rejections back as examples so the
 * engine learns this operator's judgement.
 *
 * The note panel is closed before the action runs. Revalidating while an open
 * layer holds user input remounts the tree underneath it and drops what was
 * typed, which is a bug class this repo has hit before.
 */
export function DecisionForm({ id, company }: { id: string; company: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onApprove() {
    setError(null);
    const data = new FormData();
    data.set("id", id);
    startTransition(async () => {
      const res = await approve(data);
      if (!res.ok) setError(res.error ?? "Could not approve");
    });
  }

  function onReject() {
    setError(null);
    const data = new FormData();
    data.set("id", id);
    data.set("note", note);
    // Close first, then submit. See the note above.
    setRejecting(false);
    setNote("");
    startTransition(async () => {
      const res = await reject(data);
      if (!res.ok) setError(res.error ?? "Could not reject");
    });
  }

  return (
    <div className="border-t border-[var(--line)] pt-3.5">
      {rejecting ? (
        <div className="flex flex-col gap-2.5">
          <label
            htmlFor={`note-${id}`}
            className="text-[12px] text-[var(--ink-2)]"
          >
            Why is this wrong for {company}? Optional, but this is what stops the
            engine proposing it again.
          </label>
          <textarea
            id={`note-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            maxLength={2000}
            placeholder="They went quiet after the last round, not worth a slot yet."
            className="w-full resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] outline-none focus:border-[var(--brand)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="rounded-md bg-[var(--ink-1)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--surface)] disabled:opacity-50"
            >
              {pending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setNote("");
              }}
              disabled={pending}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[12.5px] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            <Check size={14} strokeWidth={2} />
            {pending ? "Applying…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-[12.5px] disabled:opacity-50"
          >
            <X size={14} strokeWidth={2} />
            Reject
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-2 text-[12.5px] text-[var(--bad)]">{error}</p>
      ) : null}
    </div>
  );
}
