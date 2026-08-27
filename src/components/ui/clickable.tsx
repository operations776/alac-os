"use client";

import { createElement, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A row that is a link.
 *
 * The whole row navigates, not just the company name, because a reader
 * scanning a table clicks where their eye is. Controls inside the row still
 * work: a click that lands on a link, button or input is theirs, and only a
 * click on the row itself navigates. The row is focusable and answers Enter
 * so a keyboard user gets the same thing.
 */
export function Row({
  href,
  as = "tr",
  className = "",
  children,
}: {
  href: string;
  as?: "tr" | "li" | "div";
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const interactive = (t: EventTarget | null) =>
    t instanceof Element && Boolean(t.closest("a,button,input,label,select,textarea,summary,details"));

  return createElement(
    as,
    {
      tabIndex: 0,
      onClick: (e: MouseEvent) => {
        if (interactive(e.target)) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" && !interactive(e.target)) router.push(href);
      },
      className: `cursor-pointer outline-none focus-visible:bg-[var(--alac-surface-2)] ${className}`,
    },
    children,
  );
}
