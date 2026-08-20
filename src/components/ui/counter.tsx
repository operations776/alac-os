"use client";

import { useOptimistic, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { adjustMetric } from "@/app/(app)/performance/actions";

/**
 * A number with a plus and a minus.
 *
 * Used where the operator is counting something himself. The count updates the
 * instant it is clicked rather than after the server answers, because a
 * counter that lags reads as a broken button and invites a second click.
 * `useOptimistic` shows the new number immediately and rolls it back if the
 * write fails, so a failure is visible rather than silently accepted.
 *
 * Minus stops at zero. A negative call count is a mis-click, not a fact.
 */
export function Counter({
  metric,
  label,
  value,
  hint,
}: {
  metric: string;
  label: string;
  value: number;
  hint?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value, (_current, next: number) => next);

  const step = (delta: 1 | -1) => {
    const next = Math.max(0, shown + delta);
    if (next === shown) return; // already at zero, nothing to do
    startTransition(async () => {
      setShown(next);
      const data = new FormData();
      data.set("metric", metric);
      data.set("delta", String(delta));
      await adjustMetric({ ok: false }, data);
    });
  };

  return (
    <div className={`panel px-4 py-3.5 ${pending ? "is-pending" : ""}`}>
      <div className="placard text-[10px] text-[var(--alac-text-2)]">{label}</div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={shown === 0}
          aria-label={`One fewer ${label}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--alac-radius-sm)] border border-[var(--alac-line)] text-[var(--alac-text-3)] transition-colors hover:border-[var(--alac-line-strong)] hover:text-[var(--alac-text)] disabled:opacity-30 disabled:hover:border-[var(--alac-line)]"
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>

        <span
          className="readout min-w-[2.5ch] flex-1 text-center text-[26px] leading-none text-[var(--alac-accent)]"
          aria-live="polite"
        >
          {shown}
        </span>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`One more ${label}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--alac-radius-sm)] border border-[var(--alac-line)] text-[var(--alac-text-3)] transition-colors hover:border-[var(--alac-accent)] hover:text-[var(--alac-accent)]"
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>

      {hint ? (
        <div className="mt-2 text-[11.5px] leading-snug text-[var(--alac-text-3)]">{hint}</div>
      ) : null}
    </div>
  );
}
