"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  ClipboardCheck,
  Columns3,
  LayoutGrid,
  LogOut,
  Users,
} from "lucide-react";
import { brand } from "@/config/brand";

// Lucide only, 16px, stroke 1.5. No emoji. DESIGN.md section 7.
//
// `exact` exists because /portfolio/review is a child of /portfolio. Without
// it the prefix match lights up both rows at once and the sidebar stops
// telling you where you are.
//
// The numbers are the channel index. A HUD rail labels its channels, and it
// also gives the eye a fixed left column to track down, which a bare icon
// list does not.
const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutGrid, exact: false },
  { href: "/portfolio", label: "Portfolio", Icon: Columns3, exact: true },
  { href: "/portfolio/review", label: "Review", Icon: ClipboardCheck, exact: false },
  { href: "/accounts", label: "Accounts", Icon: Building2, exact: false },
  { href: "/people", label: "People", Icon: Users, exact: false },
  { href: "/engine", label: "Engine", Icon: Activity, exact: false },
];

/**
 * The rail. Fixed on desktop, a horizontal scroller above the content on
 * small screens, so the whole product stays usable on a phone without a
 * hamburger and the hidden state that comes with it.
 *
 * The active row is marked four ways: accent colour, a solid index bar, a lit
 * channel number, and aria-current. Colour is never the only signal.
 */
export function Nav({
  userName,
  userRole,
  signOut,
}: {
  userName: string;
  userRole: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <aside className="relative flex shrink-0 flex-col border-b border-[var(--line)] bg-[var(--surface)] lg:h-dvh lg:w-[228px] lg:border-b-0 lg:border-r">
      {/* Identity plate. */}
      <div className="flex items-center gap-3 px-4 py-3.5 lg:py-4">
        <div
          className="placard grid h-8 w-8 shrink-0 place-items-center border border-[var(--brand)] bg-[var(--brand-soft)] text-[10px] leading-none text-[var(--brand)]"
          aria-hidden="true"
        >
          {brand.shortName.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="display truncate text-[13px] leading-tight">{brand.name}</div>
          <div className="placard mt-1 text-[8.5px] leading-none text-[var(--ink-3)]">
            BD intelligence
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="flex gap-0.5 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0"
      >
        {NAV.map(({ href, label, Icon, exact }, i) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`placard relative flex min-h-[40px] shrink-0 items-center gap-2.5 whitespace-nowrap px-3 py-2 text-[10px] transition-colors duration-100 ${
                active
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              }`}
            >
              {/* Index bar. The second channel on the active state, visible
                  before the label is read. */}
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--brand)] lg:bottom-2 lg:left-0 lg:right-auto lg:top-2 lg:h-auto lg:w-[2px]"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`readout text-[9px] tabular-nums ${
                  active ? "text-[var(--brand)]" : "text-[var(--line-strong)]"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon size={16} strokeWidth={1.5} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-4 px-3 pb-4 pt-5 lg:flex">
        <p className="px-2 text-[10.5px] leading-relaxed text-[var(--ink-3)]">
          Scores are computed, not guessed.
          Every number opens its own arithmetic.
        </p>

        <div className="border-t border-[var(--line)] px-2 pt-3.5">
          <div className="truncate text-[12px] text-[var(--ink-2)]">{userName}</div>
          <div className="placard mt-1 text-[9px] text-[var(--ink-3)]">{userRole}</div>
          <form action={signOut}>
            <button
              type="submit"
              className="placard mt-3 inline-flex items-center gap-2 text-[9.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--bad)]"
            >
              <LogOut size={16} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Small screens: the identity block collapses, so sign out moves here. */}
      <div className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2.5 lg:hidden">
        <span className="truncate text-[11.5px] text-[var(--ink-3)]">{userName}</span>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="placard inline-flex min-h-[40px] items-center gap-2 text-[9.5px] text-[var(--ink-3)]"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
