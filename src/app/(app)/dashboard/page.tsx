import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  getOrgId, portfolioStats, topOpportunities, warmAndHiring, tierCounts,
} from "@/lib/server/queries/portfolio";
import {
  Card, CardHeader, Badge, Stat, Eyebrow, EmptyState, ScoreDot, daysAgo,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// The founder dashboard. The five section headings are the operator's own
// questions, in his words, because the product exists to answer exactly those.

export default async function DashboardPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="p-8">
        <EmptyState
          title="No data yet"
          body="Run the importers to load the account universe, then score it."
        />
      </div>
    );
  }

  const [stats, opportunities, warm, tiers] = await Promise.all([
    portfolioStats(orgId),
    topOpportunities(orgId, 5),
    warmAndHiring(orgId, 6),
    tierCounts(orgId),
  ]);

  const top25 = tiers.find((t) => t.tier === "top25");

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <header className="mb-6">
        <Eyebrow>Founder dashboard</Eyebrow>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          What matters right now
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[14px] text-[var(--ink-2)]">
          {stats.total_accounts.toLocaleString()} accounts scored, {stats.signals.toLocaleString()} dated
          signals, {stats.contacts_matched} of {stats.contacts} warm contacts matched to a company.
        </p>
      </header>

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Accounts" value={stats.total_accounts.toLocaleString()} hint="in the universe" />
        <Stat label="Hiring now" value={stats.hiring_now.toLocaleString()} hint="with open roles" tone="good" />
        <Stat label="Funded recently" value={stats.funded_recently} hint="last 180 days" />
        <Stat label="Warm accounts" value={stats.with_warm} hint="a contact you know" />
        <Stat label="Top 25 avg" value={top25?.avg_score ?? "—"} hint="portfolio quality" />
      </div>

      {/* 1. Who should we pursue */}
      <section className="mb-5">
        <Card>
          <CardHeader
            title="Who should we pursue"
            sub="Highest scoring accounts that are open to approach"
            right={
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--brand)] hover:underline"
              >
                Full portfolio <ArrowUpRight size={14} strokeWidth={1.5} />
              </Link>
            }
          />
          {opportunities.length === 0 ? (
            <EmptyState title="Nothing ranked yet" body="Run the scoring pass to populate the portfolio." />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {opportunities.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-9 text-right">
                    <ScoreDot score={a.latest_score} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/accounts/${a.id}`}
                      className="text-[14px] font-semibold hover:text-[var(--brand)] hover:underline"
                    >
                      {a.company_name}
                    </Link>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
                      {a.top_signal ?? a.vertical ?? "No signal recorded"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.open_roles_count > 0 ? (
                      <Badge tone="good">{a.open_roles_count} open</Badge>
                    ) : null}
                    {a.warm_contact_count > 0 ? (
                      <Badge tone="brand">{a.warm_contact_count} warm</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* 2. Why now */}
      <section className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Why now"
            sub="Warm, hiring, and reachable without an introduction"
          />
          {warm.length === 0 ? (
            <EmptyState
              title="No warm and hiring overlap"
              body="Import the connections list to match contacts to accounts."
            />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {warm.map((a) => {
                const age = daysAgo(a.last_funding_date);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-9 text-right">
                      <ScoreDot score={a.latest_score} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                      >
                        {a.company_name}
                      </Link>
                      <div className="mt-0.5 text-[12px] text-[var(--ink-3)]">
                        {a.warm_contact_count} contact{a.warm_contact_count === 1 ? "" : "s"} you already know
                        {a.open_roles_count > 0 ? `, ${a.open_roles_count} open roles` : ""}
                        {age != null && age < 400 ? `, funded ${age}d ago` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 3. Where should I spend my time */}
        <Card>
          <CardHeader title="Where should I spend my time" sub="How the universe splits by tier" />
          <div className="px-5 py-4">
            <ul className="flex flex-col gap-3">
              {(["top25", "next25", "watch", "unassigned"] as const).map((tier) => {
                const row = tiers.find((t) => t.tier === tier);
                const n = row?.n ?? 0;
                const pct = stats.total_accounts ? (n / stats.total_accounts) * 100 : 0;
                const labels: Record<string, string> = {
                  top25: "Top 25, work weekly",
                  next25: "Next 25, keep warm",
                  watch: "Watch list, monitor",
                  unassigned: "Unranked, the long tail",
                };
                return (
                  <li key={tier}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-[13px]">{labels[tier]}</span>
                      <span className="tabular text-[13px] font-semibold">
                        {n.toLocaleString()}
                        {row?.avg_score != null ? (
                          <span className="ml-2 font-normal text-[var(--ink-3)]">avg {row.avg_score}</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(pct, n > 0 ? 1.5 : 0)}%`,
                          background: tier === "unassigned" ? "var(--ink-3)" : "var(--brand)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              {stats.suppressed} current client{stats.suppressed === 1 ? "" : "s"} are excluded from ranking:
              they are relationships to farm, not prospects to pursue.
            </p>
          </div>
        </Card>
      </section>

      {/* 4. What changed this week */}
      <section>
        <Card>
          <CardHeader title="What changed this week" sub="Movement since the last scoring run" />
          <div className="px-5 py-4">
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
              This is the first scoring run, so there is no previous week to compare against. Deltas appear
              here from the second run onward, and they are computed from stored history rather than
              estimated. The signals behind every score are dated and sourced, so a change always has a
              reason attached.
            </p>
            <p className="mt-3 text-[12px] text-[var(--ink-3)]">
              Signals loaded: {stats.signals.toLocaleString()} across {stats.total_accounts.toLocaleString()} accounts,
              as of the current import.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
