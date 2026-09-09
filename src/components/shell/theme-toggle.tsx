"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light and dark. His ask, and the reference app has it.
 *
 * The choice lives on the html element as data-theme and in localStorage.
 * The layout applies it before paint from an inline script, so there is no
 * flash; this button only flips it. useSyncExternalStore reads the current
 * value without setting state in an effect.
 */
const KEY = "alac-theme";

function read(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark");

  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    for (const cb of listeners) cb();
  }

  return (
    <button
      type="button"
      onClick={flip}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="placard inline-flex min-h-[36px] items-center gap-2 rounded-[var(--alac-radius-sm)] px-2 text-[10px] text-[var(--alac-text-3)] transition-colors hover:text-[var(--alac-text)]"
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
