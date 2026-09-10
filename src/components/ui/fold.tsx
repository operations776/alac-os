import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * A panel that starts closed.
 *
 * The company page had thirteen cards open at once, and the two that decide
 * anything were buried in the middle of eleven that do not. Reference
 * material is here, one click from the decision, rather than in front of it.
 *
 * A details element, so it works with no JavaScript, keeps its state while
 * the page revalidates, and is findable by the browser's own search.
 */
export function Fold({
  title,
  sub,
  count,
  open = false,
  children,
}: {
  title: string;
  sub?: string;
  /** Shown beside the title so the panel says how much is inside before it opens. */
  count?: string | number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="group overflow-hidden rounded-[var(--alac-radius-lg)] bg-[var(--alac-surface)] shadow-[var(--alac-elev-1)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-[var(--alac-surface-2)]">
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="shrink-0 text-[var(--alac-text-3)] transition-transform group-open:rotate-90"
        />
        <span className="display text-[15px]">{title}</span>
        {count != null ? (
          <span className="readout text-[12.5px] text-[var(--alac-text-3)]">{count}</span>
        ) : null}
        {sub ? (
          <span className="ml-auto hidden text-[12px] text-[var(--alac-text-3)] sm:inline">{sub}</span>
        ) : null}
      </summary>
      <div className="border-t border-[var(--alac-line)]">{children}</div>
    </details>
  );
}
