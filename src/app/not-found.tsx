import Link from "next/link";
import { Logo } from "@/components/shell/logo";

/**
 * The 404. It exists because the desk rebuild moved every route, so a stale
 * bookmark was landing on Next's unstyled default page. The named routes are
 * forwarded in next.config.ts; this catches everything else and, unlike the
 * default, says where to go.
 */
export default function NotFound() {
  return (
    <main className="surface-wash flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[520px]">
        <Logo height={28} />

        <p className="placard mt-8 text-[11px] text-[var(--alac-accent)]">Error 404</p>
        <h1 className="display mt-2 text-[32px] leading-[1.15] sm:text-[38px]">
          That page is not here
        </h1>
        <p className="prose-measure mt-3 text-[14px] leading-[1.65] text-[var(--alac-text-2)]">
          The desk moved to the command center, so the portfolio, dashboard and tier review screens
          no longer exist. The work they used to hold is split across the board, the queue and the
          signal log.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          <Link href="/command" className="btn btn-primary">
            Command board
          </Link>
          <Link href="/queue" className="btn btn-secondary">
            Account queue
          </Link>
        </div>
      </div>
    </main>
  );
}
