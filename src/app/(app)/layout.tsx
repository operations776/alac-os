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
    <div className="flex min-h-dvh flex-col bg-[var(--md-surface)] lg:flex-row">
      <a href="#main" className="skip-link placard text-[13px]">
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
        className="surface-wash relative min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto"
      >
        {/* Organic blur shapes. Decorative only, positioned partly off canvas,
            and behind every panel: they read as colour bleeding into the
            surface rather than as a texture ruled on top of the content. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="blob h-[420px] w-[420px] -translate-y-1/3 translate-x-1/4 bg-[var(--md-primary)] opacity-[0.09]"
            style={{ top: 0, right: 0 }}
          />
          <div
            className="blob h-[320px] w-[320px] -translate-x-1/3 translate-y-1/4 bg-[var(--md-tertiary)] opacity-[0.08]"
            style={{ bottom: 0, left: 0 }}
          />
        </div>

        <div className="relative">{children}</div>
      </main>
    </div>
  );
}
