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
 * The active row is marked three ways: the brand colour, a solid left index
 * mark, and aria-current. Colour is never the only signal.
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
    <aside
      className="flex shrink-0 flex-col border-b border-[var(--line)] bg-[var(--surface)] lg:h-dvh lg:w-[216px] lg:border-b-0 lg:border-r"
      style={{ boxShadow: "var(--bezel)" }}
    >
      {/* Identity plate. */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 lg:px-4 lg:py-4">
        <div
          className="placard grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border text-[11px] leading-none text-[var(--brand)]"
          style={{
            background: "var(--brand-soft)",
            borderColor: "var(--brand-line)",
          }}
          aria-hidden="true"
        >
          {brand.shortName.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold leading-tight">{brand.name}</div>
          <div className="placard mt-0.5 text-[9px] leading-none text-[var(--ink-3)]">
            BD intelligence
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="flex gap-0.5 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0"
      >
        {NAV.map(({ href, label, Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[6px] px-2.5 py-2 text-[13.5px] transition-colors ${
                active
                  ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                  : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              }`}
            >
              {/* Index mark. The second channel on the active state. */}
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-2.5 right-2.5 h-[2px] rounded-full bg-[var(--brand)] lg:bottom-1.5 lg:left-0 lg:right-auto lg:top-1.5 lg:h-auto lg:w-[2px]"
                />
              ) : null}
              <Icon size={16} strokeWidth={1.5} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-3 px-3 pb-4 pt-4 lg:flex">
        <p className="px-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
          Scores are computed, not guessed. Every number opens its own arithmetic.
        </p>

        <div className="border-t border-[var(--line)] px-2 pt-3">
          <div className="truncate text-[12.5px] font-medium">{userName}</div>
          <div className="placard mt-0.5 text-[9.5px] text-[var(--ink-3)]">{userRole}</div>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-[6px] text-[11.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
            >
              <LogOut size={16} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Small screens: the identity block collapses, so sign out moves here. */}
      <div className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2 lg:hidden">
        <span className="truncate text-[12px] text-[var(--ink-2)]">{userName}</span>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-[6px] text-[11.5px] text-[var(--ink-3)]"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
