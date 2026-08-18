"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
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
    <div className="border-t border-[var(--md-outline-variant)] pt-4">
      {rejecting ? (
        <div className="flex flex-col gap-3">
          <label
            htmlFor={`note-${id}`}
            className="text-[13px] leading-relaxed text-[var(--md-on-surface-variant)]"
          >
            Why is this wrong for {company}?
            Optional, but this is what stops the engine proposing it again.
          </label>
          <textarea
            id={`note-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            maxLength={2000}
            placeholder="They went quiet after the last round, not worth a slot yet."
            className="field resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="danger" onClick={onReject} disabled={pending}>
              <X size={16} strokeWidth={1.5} />
              {pending ? "Rejecting" : "Confirm reject"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRejecting(false);
                setNote("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" onClick={onApprove} disabled={pending}>
            <Check size={16} strokeWidth={1.5} />
            {pending ? "Applying" : "Approve"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
            <X size={16} strokeWidth={1.5} />
            Reject
          </Button>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-error-container)] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--md-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
