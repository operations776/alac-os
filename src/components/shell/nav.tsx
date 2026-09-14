"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  BookOpen,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Columns3,
  FileText,
  Flame,
  FolderOpen,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  ListTodo,
  LogOut,
  PenLine,
  Repeat,
  Settings,
  Shield,
  Target,
  TrendingUp,
  UserSearch,
  Users,
  UsersRound,
} from "lucide-react";
import { brand } from "@/config/brand";
import { Logo } from "./logo";

// Lucide only, 16px, stroke 1.5. No emoji. DESIGN.md section 7.
//
// Four sections instead of twenty-two tabs. Each section is one row until it
// is opened, and the section holding the current page opens itself, so the
// rail always shows where you are without showing everything at once.
//
// The order is the order of a day: Team first (what the company is waiting
// on), then the Desk (who to win), Growth (content, GTM, delivery), and Admin,
// which only owners and admins see. Hiding Admin is a convenience; the admin
// pages refuse non-admins on the server.
//
// `exact` exists for a row that is a parent of another: /settings is the
// parent of /settings/team, and a prefix match would light up both.

type NavLink = { href: string; label: string; Icon: typeof Flame; exact?: boolean };
type NavGroup = { key: string; label: string; Icon: typeof Flame; links: NavLink[]; adminOnly?: boolean };

const GROUPS: NavGroup[] = [
  {
    key: "team",
    label: "Team",
    Icon: UsersRound,
    links: [
      { href: "/ops", label: "Command center", Icon: LayoutDashboard },
      { href: "/my-work", label: "My work", Icon: ListTodo },
      { href: "/board", label: "Company board", Icon: Columns3 },
      { href: "/calendar", label: "Calendar", Icon: CalendarDays },
    ],
  },
  {
    key: "desk",
    label: "Desk",
    Icon: LayoutGrid,
    links: [
      { href: "/command", label: "Today", Icon: LayoutGrid },
      { href: "/roles", label: "Open roles", Icon: Briefcase },
      { href: "/talent", label: "Talent", Icon: UserSearch },
      { href: "/queue", label: "Companies", Icon: ListChecks },
      { href: "/signals", label: "What changed", Icon: Flame },
      { href: "/people", label: "Your network", Icon: Users },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    Icon: TrendingUp,
    links: [
      { href: "/content", label: "Content", Icon: PenLine },
      { href: "/gtm", label: "GTM execution", Icon: Target },
      { href: "/requisitions", label: "Requisitions", Icon: FileText },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    Icon: Shield,
    adminOnly: true,
    links: [
      { href: "/settings/team", label: "Team members", Icon: UsersRound },
      { href: "/settings/recurring", label: "Recurring", Icon: Repeat },
      { href: "/sops", label: "SOPs", Icon: BookOpen },
      { href: "/ideas", label: "Ideas", Icon: Lightbulb },
      { href: "/files", label: "Files", Icon: FolderOpen },
      { href: "/archive", label: "Archive", Icon: Archive },
      { href: "/settings", label: "Settings", Icon: Settings, exact: true },
      { href: "/how", label: "How it works", Icon: Info },
    ],
  },
];

function isActive(pathname: string, { href, exact }: NavLink) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The navigation drawer. Fixed on desktop; on small screens the sections are a
 * row of chips with the open section's pages scrolling beneath, so the whole
 * product stays usable on a phone without a hamburger.
 *
 * The selected row is marked three ways: the tonal pill, the label and icon
 * colour, and aria-current. Colour is never the only signal.
 */
export function Nav({
  userName,
  userRole,
  isAdmin,
  signOut,
}: {
  userName: string;
  userRole: string;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const groups = GROUPS.filter((g) => !g.adminOnly || isAdmin);
  const current = groups.find((g) => g.links.some((l) => isActive(pathname, l)))?.key ?? "team";

  // Opened by hand, or else the section holding the page. Navigating to a page
  // in another section opens that one, because the override is keyed to the
  // path it was set on.
  const [manual, setManual] = useState<{ path: string; open: string | null } | null>(null);
  const open = manual && manual.path === pathname ? manual.open : current;
  const toggle = (key: string) => setManual({ path: pathname, open: open === key ? null : key });

  return (
    <aside className="relative z-10 flex shrink-0 flex-col border-b border-[var(--alac-line)] bg-[var(--alac-surface)] lg:h-dvh lg:w-[248px] lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-[var(--alac-line)] px-5 py-[18px]">
        <Link href="/ops" aria-label={`${brand.name} home`} className="flex items-center">
          <Logo height={26} />
        </Link>
      </div>

      {/* Desktop: an accordion of sections. */}
      <nav aria-label="Primary" className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3 lg:flex">
        {groups.map((g) => {
          const expanded = open === g.key;
          const holdsPage = g.key === current;
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={expanded}
                aria-controls={`nav-${g.key}`}
                className={`placard flex min-h-[40px] w-full items-center gap-3 rounded-[var(--alac-radius-sm)] px-3 text-[11px] transition-colors ${
                  holdsPage ? "text-[var(--alac-text)]" : "text-[var(--alac-text-3)] hover:text-[var(--alac-text)]"
                } hover:bg-[var(--alac-surface-2)]`}
              >
                <g.Icon size={16} strokeWidth={1.5} className="shrink-0" />
                {g.label}
                <ChevronDown
                  size={16}
                  strokeWidth={1.5}
                  className={`ml-auto shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                />
              </button>
              {/* grid-template-rows 0fr to 1fr animates to the content's real
                  height, which a max-height transition only approximates. */}
              <div
                id={`nav-${g.key}`}
                className={`grid transition-[grid-template-rows] duration-200 ease-[var(--alac-ease)] ${
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="flex flex-col gap-0.5 pb-2 pl-3 pt-0.5">
                    {g.links.map((l) => (
                      <NavItem key={l.href} link={l} active={isActive(pathname, l)} tabbable={expanded} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Small screens: section chips, then the open section's pages. */}
      <nav aria-label="Primary" className="lg:hidden">
        <div className="flex gap-1 overflow-x-auto px-3 pt-2">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={open === g.key}
              className={`placard inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-[var(--alac-radius-sm)] px-3 text-[10px] transition-colors ${
                open === g.key
                  ? "bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]"
                  : "text-[var(--alac-text-3)]"
              }`}
            >
              <g.Icon size={16} strokeWidth={1.5} />
              {g.label}
            </button>
          ))}
        </div>
        {open ? (
          <div key={open} className="rise flex gap-0.5 overflow-x-auto px-3 py-2">
            {groups.find((g) => g.key === open)?.links.map((l) => (
              <NavItem key={l.href} link={l} active={isActive(pathname, l)} tabbable />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="hidden flex-col px-5 pb-5 pt-3 lg:flex">
        <div className="border-t border-[var(--alac-line)] pt-3">
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

function NavItem({ link, active, tabbable }: { link: NavLink; active: boolean; tabbable: boolean }) {
  const { href, label, Icon } = link;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // A collapsed section's links are still in the DOM for the height
      // animation; they must not be reachable by Tab while hidden.
      tabIndex={tabbable ? undefined : -1}
      className={`placard relative flex min-h-[34px] shrink-0 items-center gap-3 whitespace-nowrap rounded-[var(--alac-radius-sm)] px-3 text-[11px] transition-colors ${
        active
          ? "bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]"
          : "text-[var(--alac-text-3)] hover:bg-[var(--alac-surface-2)] hover:text-[var(--alac-text)]"
      }`}
    >
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
}
