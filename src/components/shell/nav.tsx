"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Flame,
  LayoutGrid,
  Target,
  ListChecks,
  LogOut,
  Users,
  Briefcase,
} from "lucide-react";
import { brand } from "@/config/brand";
import { Logo } from "./logo";

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
  { href: "/command", label: "Today", Icon: LayoutGrid, exact: false },
  { href: "/targets", label: "Who to target", Icon: Target, exact: false },
  { href: "/queue", label: "All companies", Icon: ListChecks, exact: false },
  { href: "/signals", label: "What changed", Icon: Flame, exact: false },
  { href: "/roles", label: "Open roles", Icon: Briefcase, exact: false },
  { href: "/performance", label: "Results", Icon: Activity, exact: false },
  { href: "/people", label: "Your network", Icon: Users, exact: false },
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
    <aside className="relative z-10 flex shrink-0 flex-col border-b border-[var(--alac-line)] bg-[var(--alac-surface)] lg:h-dvh lg:w-[248px] lg:border-b-0 lg:border-r">
      {/* The real mark, inverted to white for this ground. It is the whole
          identity plate: the company name is in the logo, so repeating it as
          text beside itself would just be the name twice. */}
      <div className="flex items-center gap-3 border-b border-[var(--alac-line)] px-5 py-[18px]">
        <Link href="/command" aria-label={`${brand.name} home`} className="flex items-center">
          <Logo height={26} />
        </Link>
      </div>

      <nav
        aria-label="Primary"
        className="flex gap-0.5 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible"
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
              className={`placard relative flex min-h-[42px] shrink-0 items-center gap-3 whitespace-nowrap rounded-[var(--alac-radius-sm)] px-3 text-[11px] transition-colors ${
                active
                  ? "bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]"
                  : "text-[var(--alac-text-3)] hover:bg-[var(--alac-surface-2)] hover:text-[var(--alac-text)]"
              }`}
            >
              {/* The selected row is marked twice: the tonal fill and this
                  rule. Colour is never the only signal. */}
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-3 right-3 h-[2px] bg-[var(--alac-accent)] lg:bottom-2 lg:left-0 lg:right-auto lg:top-2 lg:h-auto lg:w-[2px]"
                />
              ) : null}
              <Icon size={16} strokeWidth={1.5} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-4 px-5 pb-5 pt-6 lg:flex">
        <p className="text-[12px] leading-relaxed text-[var(--alac-text-3)]">
          Priority and final score come from the Master TAM. Heat is computed
          here, and every number opens its own arithmetic.
        </p>

        <div className="border-t border-[var(--alac-line)] pt-4">
          <div className="truncate text-[13px] text-[var(--alac-text-2)]">{userName}</div>
          <div className="placard mt-1 text-[10px] text-[var(--alac-text-3)]">{userRole}</div>
          <form action={signOut}>
            <button
              type="submit"
              className="placard mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-[var(--alac-radius-sm)] px-2 text-[10px] text-[var(--alac-text-3)] transition-colors hover:text-[var(--alac-red-text)]"
            >
              <LogOut size={16} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Small screens: the identity block collapses, so sign out moves here. */}
      <div className="flex items-center gap-3 border-t border-[var(--alac-line)] px-5 py-2 lg:hidden">
        <span className="truncate text-[12px] text-[var(--alac-text-3)]">{userName}</span>
        <form action={signOut} className="ml-auto">
          <button
            type="submit"
            className="placard inline-flex min-h-[40px] items-center gap-2 px-2 text-[10px] text-[var(--alac-text-3)]"
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
