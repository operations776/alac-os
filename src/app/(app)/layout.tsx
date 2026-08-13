import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Nav } from "@/components/shell/nav";
import { currentSession } from "@/lib/server/auth";
import { signOutAction } from "@/app/signin/actions";

/**
 * The gate for every authenticated page. It runs on the server before any
 * child renders, so an unauthenticated request never reaches a query.
 *
 * This is the enforcement point rather than middleware: middleware runs on the
 * edge without database access, so it could only check that a cookie exists,
 * not that it maps to a live session.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/signin");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a href="#main" className="skip-link text-[13px] font-semibold">
        Skip to content
      </a>
      <Nav
        userName={session.fullName || session.email}
        userRole={session.role}
        signOut={signOutAction}
      />
      <main
        id="main"
        tabIndex={-1}
        className="graticule min-w-0 flex-1 bg-[var(--bg)] lg:h-dvh lg:overflow-y-auto"
      >
        {children}
      </main>
    </div>
  );
}
