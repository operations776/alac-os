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
    <div className="flex min-h-dvh flex-col bg-[var(--alac-ground)] lg:flex-row">
      <a href="#main" className="skip-link placard text-[13px]">
        Skip to content
      </a>
      <Nav
        userName={session.fullName || session.email}
        userRole={session.role}
        signOut={signOutAction}
      />
      {/* The navy wash carries the whole atmosphere now. The blurred shapes
          that used to sit here are gone with the light theme: on a near black
          ground they read as smudges rather than as depth, and the gradient
          alone gives the page the same lift the marketing site gets from its
          photograph. */}
      <main
        id="main"
        tabIndex={-1}
        className="surface-wash min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto"
      >
        {children}
      </main>
    </div>
  );
}
