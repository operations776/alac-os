"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Columns3, Building2, Users, Activity, ClipboardCheck } from "lucide-react";
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

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[212px] shrink-0 flex-col gap-1 border-r border-[var(--line)] bg-[var(--surface)] px-3 py-4">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <div
          className="grid h-7 w-7 place-items-center rounded-[6px] text-[12px] font-extrabold text-white"
          style={{ background: "var(--brand)" }}
        >
          A
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold leading-tight">{brand.name}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13.5px] transition-colors ${
                active
                  ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                  : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
        Scores are computed, not guessed. Every number opens its own arithmetic.
      </div>
    </aside>
  );
}
