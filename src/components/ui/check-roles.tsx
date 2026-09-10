"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { checkRolesNow, type CheckState } from "@/app/(app)/roles/actions";

/**
 * Check the postings are still open, now.
 *
 * The same check that runs every morning, on demand. It says what it did,
 * including how many pages it could not reach, because a check that reports
 * only its successes is a check nobody can calibrate.
 */
export function CheckRoles() {
  const [state, action, pending] = useActionState<CheckState, FormData>(
    async () => checkRolesNow(),
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        title="Opens each posting's page and closes the ones that have gone. Runs every morning on its own."
        className="btn btn-secondary disabled:opacity-60"
      >
        <RefreshCw size={16} strokeWidth={1.5} className={pending ? "animate-spin" : ""} />
        {pending ? "Checking" : "Check postings"}
      </button>
      {state.message ? (
        <span className="text-[12.5px] text-[var(--alac-good)]">{state.message}</span>
      ) : null}
      {state.error ? (
        <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
      ) : null}
    </form>
  );
}
