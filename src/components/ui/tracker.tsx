"use client";

import { useActionState, useState } from "react";
import { Check, Copy, MessageSquare, Send } from "lucide-react";
import { Dialog } from "./dialog";
import { addNote, saveMessage } from "@/app/(app)/queue/[id]/tracker";

// The parts of the tracker that need a browser: a note box that clears after
// saving, and a message dialog. Marks and sent flags are plain forms and live
// in the server components that render them.

export function NoteForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(addNote, { ok: false, n: 0 });
  return (
    // Keyed on the save count so a successful save remounts an empty box.
    <form key={state.n ?? 0} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Who you spoke to, what they said, what happens next"
        aria-label="Add a note"
        className="field resize-y"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving" : "Add note"}
        </button>
        {state.error ? (
          <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Write or edit a message to one person, and record whether it was sent.
 *
 * The person need not be connected or even sourced. The only fact the desk
 * records is what he wrote and whether he sent it; sending itself happens in
 * LinkedIn or email, by him.
 */
export function MessageButton({
  accountId,
  person,
  channel = "linkedin",
  body,
  sentAt,
  compact,
}: {
  accountId: string;
  person: string;
  channel?: string;
  body?: string | null;
  sentAt?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveMessage, { ok: false, n: 0 });
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(body ?? "");

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const sent = Boolean(sentAt);
  const label = sent ? "Sent" : body ? "Edit message" : "Message";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={sent ? `Sent ${new Date(sentAt as string).toLocaleDateString()}` : `Write to ${person}`}
        className={
          sent
            ? "placard inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[color-mix(in_oklab,var(--alac-good)_40%,transparent)] bg-[var(--alac-good-soft)] px-2 text-[10px] text-[var(--alac-good)]"
            : "placard inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[var(--alac-line)] bg-[var(--alac-ground)] px-2 text-[10px] text-[var(--alac-text-2)] transition-colors hover:border-[var(--alac-accent)] hover:text-[var(--alac-accent)]"
        }
      >
        {sent ? <Check size={16} strokeWidth={1.5} /> : <MessageSquare size={16} strokeWidth={1.5} />}
        {compact && !sent ? null : label}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Message ${person}`}
        sub={sent ? `Sent ${new Date(sentAt as string).toLocaleString()}. Editing keeps that date.` : "Saved here, sent by you. Nothing leaves this page."}
      >
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="person" value={person} />
          <div className="flex items-center gap-3">
            <label className="text-[12.5px] text-[var(--alac-text-2)]">
              Channel{" "}
              <select name="channel" defaultValue={channel} className="field ml-1 w-auto">
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>
          <textarea
            name="body"
            rows={9}
            required
            maxLength={6000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write it the way you would say it. Referral first, who you are, one number, one question."
            aria-label="Message body"
            className="field resize-y font-[inherit]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" name="sent" value="0" disabled={pending} className="btn btn-secondary">
              Save draft
            </button>
            <button type="submit" name="sent" value="1" disabled={pending} className="btn btn-primary">
              <Send size={16} strokeWidth={1.5} /> Save and mark sent
            </button>
            <button type="button" onClick={copy} className="btn btn-ghost">
              {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
              {copied ? "Copied" : "Copy"}
            </button>
            {state.ok ? (
              <span className="text-[12.5px] text-[var(--alac-good)]">Saved</span>
            ) : state.error ? (
              <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
            ) : null}
          </div>
        </form>
      </Dialog>
    </>
  );
}
