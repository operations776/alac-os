import Link from "next/link";
import { Lock } from "lucide-react";
import { getOrgId, accountsByTier, tierCounts, type Tier } from "@/lib/server/queries/portfolio";
import {
  Badge, Card, EmptyState, PageHeader, ScoreDot, TickScale,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const COLUMNS: { tier: Tier; label: string; blurb: string }[] = [
  { tier: "top25", label: "Top 25", blurb: "Work these every week" },
  { tier: "next25", label: "Next 25", blurb: "Keep warm, promote when a signal lands" },
  { tier: "watch", label: "Watch list", blurb: "Monitor for a trigger" },
];

export default async function PortfolioPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No data yet" body="Run the importers first." />
        </Card>
      </div>
    );
  }

  const [counts, ...columns] = await Promise.all([
    tierCounts(orgId),
    ...COLUMNS.map((c) => accountsByTier(orgId, c.tier, 25)),
  ]);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Portfolio intelligence"
        title="The account portfolio"
        lede="Ranked by a deterministic score, not by a source list position. Pinned accounts are held in place by a human and the engine may not demote them."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col, i) => {
          const rows = columns[i];
          const count = counts.find((c) => c.tier === col.tier);
          return (
            <Card key={col.tier} className="flex flex-col">
              {/* Column header reads as a channel strip: name, count, mean. */}
              <div className="border-b border-[var(--line)] px-4 py-3.5">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[15px] font-semibold">{col.label}</h2>
                  <span className="readout text-[12.5px] text-[var(--ink-2)]">
                    {(count?.n ?? 0).toLocaleString()}
                  </span>
                  <span className="ml-auto shrink-0 text-[11.5px] text-[var(--ink-3)]">
                    {count?.avg_score != null ? (
                      <>
                        avg <span className="readout text-[var(--ink-2)]">{count.avg_score}</span>
                      </>
                    ) : (
                      "no mean yet"
                    )}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--ink-3)]">{col.blurb}</p>
                {count?.avg_score != null ? (
                  <div className="mt-2.5">
                    <TickScale value={count.avg_score} max={100} ticks={10} height={6} />
                  </div>
                ) : null}
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  title="Empty"
                  body="No accounts have landed in this tier yet. The engine assigns a tier only after a scoring run."
                />
              ) : (
                <ol className="divide-y divide-[var(--line)]">
                  {rows.map((a, rank) => (
                    <li
                      key={a.id}
                      className="px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <div className="flex items-baseline gap-2.5">
                        <span className="readout w-[20px] shrink-0 text-right text-[10.5px] text-[var(--ink-3)]">
                          {String(rank + 1).padStart(2, "0")}
                        </span>
                        <span className="w-8 shrink-0 text-right">
                          <ScoreDot score={a.latest_score} />
                        </span>
                        <Link
                          href={`/accounts/${a.id}`}
                          className="min-w-0 flex-1 truncate rounded-[6px] text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                        >
                          {a.company_name}
                        </Link>
                        {a.tier_locked ? (
                          <span
                            title="Pinned by a human, the engine may not demote it"
                            className="shrink-0 text-[var(--brand)]"
                          >
                            <Lock size={16} strokeWidth={1.5} />
                            <span className="sr-only">Pinned</span>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[60px]">
                        {a.open_roles_count > 0 ? (
                          <Badge tone="good">{a.open_roles_count} open</Badge>
                        ) : null}
                        {a.warm_contact_count > 0 ? (
                          <Badge tone="brand">{a.warm_contact_count} warm</Badge>
                        ) : null}
                        {a.open_roles_count === 0 && a.warm_contact_count === 0 ? (
                          <span className="text-[11.5px] text-[var(--ink-3)]">
                            {a.vertical ?? "No live signal"}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
