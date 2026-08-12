import { brand } from "@/config/brand";

// Placeholder root. ALAC-15 replaces this with a redirect to /dashboard for a
// signed in user, or to /signin for everyone else.

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="prose-measure">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand">
          {brand.shortName}
        </p>
        <h1 className="mt-2 text-[24px] font-bold leading-[1.2] text-ink text-balance">
          {brand.name}
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink-2">
          {brand.tagline}
        </p>
        <p className="mt-6 text-[12px] leading-[1.45] text-ink-3">
          Foundation only. The portfolio, decision engine, and founder dashboard
          arrive on the tickets in TICKETS.md.
        </p>
      </div>
    </main>
  );
}
