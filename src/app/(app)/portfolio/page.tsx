import Link from "next/link";
import { Lock } from "lucide-react";
import { getOrgId, accountsByTier, tierCounts, type Tier } from "@/lib/server/queries/portfolio";
import { Card, Badge, Eyebrow, EmptyState, ScoreDot } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const COLUMNS: { tier: Tier; label: string; blurb: string }[] = [
  { tier: "top25", label: "Top 25", blurb: "Work these every week" },
  { tier: "next25", label: "Next 25", blurb: "Keep warm, promote when a signal lands" },
  { tier: "watch", label: "Watch list", blurb: "Monitor for a trigger" },
];

export default async function PortfolioPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return <div className="p-8"><EmptyState title="No data yet" body="Run the importers first." /></div>;
  }

  const [counts, ...columns] = await Promise.all([
    tierCounts(orgId),
    ...COLUMNS.map((c) => accountsByTier(orgId, c.tier, 25)),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <header className="mb-6">
        <Eyebrow>Portfolio intelligence</Eyebrow>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          The account portfolio
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[14px] text-[var(--ink-2)]">
          Ranked by a deterministic score, not by a source list position. Pinned accounts are held in
          place by a human and the engine may not demote them.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col, i) => {
          const rows = columns[i];
          const count = counts.find((c) => c.tier === col.tier);
          return (
            <Card key={col.tier} className="flex flex-col">
              <div className="border-b border-[var(--line)] px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[15px] font-bold">{col.label}</h2>
                  <span className="tabular text-[12.5px] text-[var(--ink-3)]">
                    {count?.n ?? 0}
                  </span>
                  {count?.avg_score != null ? (
                    <span className="ml-auto text-[11.5px] text-[var(--ink-3)]">avg {count.avg_score}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">{col.blurb}</p>
              </div>

              {rows.length === 0 ? (
                <EmptyState title="Empty" body="No accounts have landed in this tier yet." />
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {rows.map((a) => (
                    <li key={a.id} className="px-4 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <div className="w-8 shrink-0 text-right">
                          <ScoreDot score={a.latest_score} />
                        </div>
                        <Link
                          href={`/accounts/${a.id}`}
                          className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                        >
                          {a.company_name}
                        </Link>
                        {a.tier_locked ? (
                          <span title="Pinned by a human" className="shrink-0 text-[var(--brand)]">
                            <Lock size={13} strokeWidth={1.5} />
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-10">
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
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
