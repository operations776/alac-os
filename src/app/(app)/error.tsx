"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

/**
 * The error boundary for every signed in screen.
 *
 * It exists because this app talks to a remote database and three external
 * APIs, so a page CAN fail, and the default is an unstyled crash page that
 * tells the operator nothing and offers no way back.
 *
 * The underlying message is logged, not shown. A Postgres error or a vendor's
 * error code means nothing to Adrian and can name internal detail; what he
 * needs is whether to retry or to tell someone.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[560px] flex-col justify-center px-5 py-10">
      <div className="rise">
        <p className="placard text-[11px] text-[var(--alac-red-text)]">Something went wrong</p>
        <h1 className="display mt-2 text-[26px] leading-[1.2]">This screen could not load</h1>
        <p className="prose-measure mt-3 text-[14px] leading-[1.6] text-[var(--alac-text-2)]">
          The data behind this page did not come back. It is usually temporary, so trying again is
          worth doing first. Nothing was changed and nothing was lost.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCw size={16} strokeWidth={1.5} />
            Try again
          </button>
          <a href="/command" className="btn btn-secondary">
            Back to today
          </a>
        </div>

        {/* The digest is the only thing worth quoting: it is how a specific
            failure is found in the logs, and it carries no detail itself. */}
        {error.digest ? (
          <p className="readout mt-6 text-[12px] text-[var(--alac-text-3)]">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
