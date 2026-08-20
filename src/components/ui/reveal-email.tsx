"use client";

import { useActionState } from "react";
import { Mail, Search } from "lucide-react";
import { revealEmail } from "@/app/(app)/queue/[id]/actions";

/**
 * The find email button.
 *
 * Three states, and they are genuinely different facts:
 *   already known    show the address, mailto, no cost
 *   held             an address exists and one click buys it
 *   none             looked and found nothing, so no button
 *
 * The button says what it will do rather than just "Find": a click spends a
 * credit, and a control that spends money should say so before it is pressed.
 */
export function RevealEmail({
  targetId,
  email,
  status,
  revealed,
}: {
  targetId: string;
  email: string | null;
  status: string | null;
  revealed: boolean;
}) {
  const [state, action, pending] = useActionState(revealEmail, {
    ok: false,
    email: null,
    error: null,
  });

  const known = (revealed && email) || state.email;
  if (known) {
    return (
      <a href={`mailto:${known}`} className="link inline-flex items-center gap-1.5 text-[12px]">
        <Mail size={16} strokeWidth={1.5} />
        {known}
      </a>
    );
  }

  if (state.error) {
    return (
      <span className="text-[11.5px] text-[var(--alac-text-3)]" title={state.error}>
        {state.error}
      </span>
    );
  }

  if (status !== "VERIFIED") {
    return (
      <span className="text-[12px] text-[var(--alac-text-3)]" title="No address on file">
        &ndash;&ndash;
      </span>
    );
  }

  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="targetId" value={targetId} />
      <button
        type="submit"
        disabled={pending}
        title="Fetches the verified work address. Costs one credit, and nothing if this person was looked up in the last 90 days."
        className="placard inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[color-mix(in_oklab,var(--alac-accent)_40%,transparent)] bg-[var(--alac-accent-soft)] px-2 text-[10px] text-[var(--alac-accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--alac-accent)_18%,var(--alac-accent-soft))] disabled:opacity-50"
      >
        <Search size={16} strokeWidth={1.5} />
        {pending ? "Looking" : "Find email"}
      </button>
    </form>
  );
}
