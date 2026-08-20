"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A modal dialog.
 *
 * Hand rolled rather than pulled in, because the behaviour that makes a dialog
 * usable is short and the parts that get skipped are always the accessibility
 * ones. All four are here:
 *
 *   Escape closes it
 *   a click on the backdrop closes it, a click inside does not
 *   focus moves into the panel on open and returns to the trigger on close
 *   the page behind does not scroll while it is open
 *
 * `role="dialog"` with `aria-modal` tells a screen reader the rest of the page
 * is inert, and the heading is wired to `aria-labelledby` so it is announced
 * on open rather than leaving the user to guess what appeared.
 */
export function Dialog({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Where focus was before the dialog opened, so it can be put back. Losing it
  // dumps a keyboard user at the top of the document.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnTo.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    // Stop the page behind scrolling. The scrollbar is replaced with padding
    // so the layout does not jump sideways as it disappears.
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    // Focus the panel itself rather than the first control: focusing a button
    // makes it look pressed, and focusing a close button invites closing it.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleId = `dlg-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className="overlay"
      // A click on the backdrop closes. The check is that the click STARTED
      // and ended on the backdrop itself: without it, a drag that begins on
      // text inside the panel and releases outside closes the dialog and loses
      // whatever was being selected.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="overlay-panel outline-none"
      >
        <div className="flex items-start gap-4 border-b border-[var(--alac-line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="display text-[17px] leading-tight">
              {title}
            </h2>
            {sub ? (
              <p className="mt-1 text-[12.5px] text-[var(--alac-text-3)]">{sub}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-[var(--alac-radius-sm)] p-1.5 text-[var(--alac-text-3)] transition-colors hover:bg-[var(--alac-surface-2)] hover:text-[var(--alac-text)]"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--alac-line)] px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
