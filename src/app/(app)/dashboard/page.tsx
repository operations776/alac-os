import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  getOrgId, portfolioStats, topOpportunities, warmAndHiring, tierCounts,
} from "@/lib/server/queries/portfolio";
import {
  Badge, Card, CardHeader, EmptyState, GaugeRow, NoticeLine, PageHeader,
  ScoreDot, Stat, daysAgo,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// The founder dashboard. The section headings are the operator's own
// questions, in his words, because the product exists to answer exactly those.

const TIER_LABELS: Record<string, string> = {
  top25: "Top 25, work weekly",
  next25: "Next 25, keep warm",
  watch: "Watch list, monitor",
  unassigned: "Unranked, the long tail",
};

export default async function DashboardPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState
            title="No data yet"
            body="Run the importers to load the account universe, then score it."
          />
        </Card>
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
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Founder dashboard"
        title="What matters right now"
        lede={
          <>
            {stats.total_accounts.toLocaleString()} accounts scored, {stats.signals.toLocaleString()} dated
            signals, {stats.contacts_matched} of {stats.contacts} warm contacts matched to a company.
          </>
        }
      />

      {/* The instrument row. Five readings, always in this order. */}
      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Accounts" value={stats.total_accounts.toLocaleString()} hint="in the universe" />
        <Stat
          label="Hiring now"
          value={stats.hiring_now.toLocaleString()}
          hint="with open roles"
          tone="readout"
        />
        <Stat label="Funded recently" value={stats.funded_recently} hint="last 180 days" />
        <Stat label="Warm accounts" value={stats.with_warm} hint="a contact you know" />
        <Stat
          label="Top 25 avg"
          value={top25?.avg_score ?? "--"}
          hint={top25?.avg_score == null ? "no tier scored yet" : "portfolio quality"}
        />
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
                className="inline-flex items-center gap-1.5 rounded-[6px] text-[12.5px] font-semibold text-[var(--brand)] hover:underline"
              >
                Full portfolio <ArrowUpRight size={16} strokeWidth={1.5} />
              </Link>
            }
          />
          {opportunities.length === 0 ? (
            <EmptyState
              title="Nothing ranked yet"
              body="No account has landed in Top 25 or Next 25, so there is nothing to pursue from here. Run the scoring pass to populate the portfolio."
            />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {opportunities.map((a, i) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="readout w-[22px] shrink-0 text-[11px] text-[var(--ink-3)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="w-9 shrink-0 text-right">
                    <ScoreDot score={a.latest_score} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/accounts/${a.id}`}
                      className="rounded-[6px] text-[14px] font-semibold hover:text-[var(--brand)] hover:underline"
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

      {/* 2. Why now, and 3. Where should I spend my time */}
      <section className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title="Why now" sub="Warm, hiring, and reachable without an introduction" />
          {warm.length === 0 ? (
            <EmptyState
              title="No warm and hiring overlap"
              body="No account currently has both a warm contact and an open role. Import the connections list to match contacts to accounts."
            />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {warm.map((a) => {
                const age = daysAgo(a.last_funding_date);
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <div className="w-9 shrink-0 text-right">
                      <ScoreDot score={a.latest_score} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="rounded-[6px] text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                      >
                        {a.company_name}
                      </Link>
                      <div className="mt-0.5 text-[12px] leading-snug text-[var(--ink-3)]">
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

        <Card className="flex flex-col">
          <CardHeader title="Where should I spend my time" sub="How the universe splits by tier" />
          <div className="flex flex-1 flex-col px-5 py-4">
            <ul className="flex flex-col gap-3.5">
              {(["top25", "next25", "watch", "unassigned"] as const).map((tier) => {
                const row = tiers.find((t) => t.tier === tier);
                const n = row?.n ?? 0;
                return (
                  <li key={tier}>
                    <GaugeRow
                      label={TIER_LABELS[tier]}
                      value={n}
                      max={stats.total_accounts || 1}
                      ticks={10}
                      tone={tier === "unassigned" ? "ink" : "readout"}
                      display={
                        <>
                          {n.toLocaleString()}
                          {row?.avg_score != null ? (
                            <span className="text-[var(--ink-3)]"> avg {row.avg_score}</span>
                          ) : null}
                        </>
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto border-t border-[var(--line)] pt-3.5">
              <NoticeLine>
                {stats.suppressed} current client{stats.suppressed === 1 ? "" : "s"} are excluded from
                ranking: they are relationships to farm, not prospects to pursue.
              </NoticeLine>
            </div>
          </div>
        </Card>
      </section>

      {/* 4. What changed this week. The honest gap: there is no prior run to
          diff against, and the product says so rather than showing a zero. */}
      <section>
        <Card>
          <CardHeader title="What changed this week" sub="Movement since the last scoring run" />
          <div className="px-5 py-4">
            <div className="well rounded-[6px] border border-[var(--line)] px-4 py-3.5">
              <div className="placard mb-2 text-[10px] text-[var(--ink-3)]">
                No baseline available
              </div>
              <p className="prose-measure text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                This is the first scoring run, so there is no previous week to compare against. Deltas appear
                here from the second run onward, and they are computed from stored history rather than
                estimated. The signals behind every score are dated and sourced, so a change always has a
                reason attached.
              </p>
            </div>
            <p className="readout mt-3 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
              Signals loaded: {stats.signals.toLocaleString()} across{" "}
              {stats.total_accounts.toLocaleString()} accounts, as of the current import.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
