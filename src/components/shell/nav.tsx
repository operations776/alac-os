"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Flame,
  LayoutGrid,
  ListChecks,
  LogOut,
  Users,
} from "lucide-react";
import { brand } from "@/config/brand";

// Lucide only, 16px, stroke 1.5. No emoji. DESIGN.md section 7.
//
// The tabs of the desk, in the order the operating instructions put them:
// the board is the picture, the queue is where the work happens, signals say
// what changed, performance is the Thursday review.
//
// `exact` exists for any row that is a parent of another. It is false
// everywhere here because no two routes nest, but it stays because the moment
// one does, a prefix match lights up both rows and the rail stops telling you
// where you are.
//
// The channel index numbers that used to sit in the left column are gone with
// the terminal theme: a Material navigation drawer marks its selected item
// with a tonal pill, which is a stronger signal than a lit digit and does not
// need a second column to track down.
const NAV = [
  { href: "/command", label: "Command board", Icon: LayoutGrid, exact: false },
  { href: "/queue", label: "Account queue", Icon: ListChecks, exact: false },
  { href: "/signals", label: "Signal heat", Icon: Flame, exact: false },
  { href: "/performance", label: "Performance", Icon: Activity, exact: false },
  { href: "/people", label: "People", Icon: Users, exact: false },
];

/**
 * The navigation drawer. Fixed on desktop, a horizontal scroller above the
 * content on small screens, so the whole product stays usable on a phone
 * without a hamburger and the hidden state that comes with it.
 *
 * The selected row is marked three ways: the tonal pill, the label and icon
 * colour, and aria-current. Colour is never the only signal.
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
    <aside className="relative z-10 flex shrink-0 flex-col bg-[var(--md-surface-container)] lg:h-dvh lg:w-[240px] lg:rounded-r-[var(--md-radius-xl)]">
      {/* Identity plate. The monogram sits in a primary container, which is
          the one place the seed colour appears at full strength in the rail. */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--md-primary)] text-[13px] font-medium leading-none text-[var(--md-on-primary)]"
          aria-hidden="true"
        >
          {brand.shortName.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="display truncate text-[16px] leading-tight text-[var(--md-on-surface)]">
            {brand.name}
          </div>
          <div className="mt-0.5 text-[12px] leading-none text-[var(--md-on-surface-muted)]">
            BD intelligence
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0"
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
              className={`placard flex min-h-[48px] shrink-0 items-center gap-3 whitespace-nowrap rounded-full px-4 text-[14px] transition-colors duration-300 ${
                active
                  ? "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]"
                  : "text-[var(--md-on-surface-variant)] hover:bg-[color-mix(in_oklab,var(--md-primary)_10%,transparent)] hover:text-[var(--md-on-surface)]"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-4 px-3 pb-5 pt-6 lg:flex">
        <p className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-container-low)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--md-on-surface-variant)]">
          Scores are computed, not guessed. Every number opens its own
          arithmetic.
        </p>

        <div className="px-2">
          <div className="truncate text-[13.5px] text-[var(--md-on-surface)]">{userName}</div>
          <div className="mt-0.5 text-[12px] text-[var(--md-on-surface-muted)]">{userRole}</div>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-[var(--md-on-surface-variant)] transition-colors duration-300 hover:bg-[var(--md-error-container)] hover:text-[var(--md-error)]"
            >
              <LogOut size={16} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Small screens: the identity block collapses, so sign out moves here. */}
      <div className="flex items-center gap-3 px-5 pb-3 lg:hidden">
        <span className="truncate text-[12.5px] text-[var(--md-on-surface-muted)]">
          {userName}
        </span>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-[var(--md-on-surface-variant)]"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
