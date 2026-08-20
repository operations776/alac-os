import Link from "next/link";
import {
  getOrgId, performanceRollup, performanceWeeks, type Period,
} from "@/lib/server/queries/desk";
import {
  Card, CardHeader, EmptyState, NoticeLine, PageHeader, Stat, formatDate,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// PERFORMANCE. Provisional, and the screen says so, because the SourceWhale
// export schema is not settled yet.
//
// Two rules from the operating instructions shape this page. First, use only
// data SourceWhale actually reported and never estimate a missing number: a
// null renders as "not reported", never as zero. Second, the Thursday review
// is the point of the tab, so the choke point analysis is given as much room
// as the counters rather than being tucked under them.

const PERIODS: Period[] = ["WEEK", "MONTH", "QUARTER", "YEAR"];

/**
 * A conversion rate, or nothing.
 *
 * A rate with a zero denominator is undefined, not zero percent, and printing
 * "0%" for it would read as a failed conversion rather than an absent one.
 */
function rate(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org before opening performance." />
        </Card>
      </div>
    );
  }

  const period = (PERIODS.includes(params.period as Period) ? params.period : "WEEK") as Period;
  const [roll, weeks] = await Promise.all([
    performanceRollup(orgId, period),
    performanceWeeks(orgId, 12),
  ]);

  const rates = [
    { label: "Calls to conversations", v: rate(roll.client_conversations, roll.bd_calls) },
    { label: "Conversations to discovery", v: rate(roll.discoveries, roll.client_conversations) },
    { label: "Discovery to opportunity", v: rate(roll.qualified_opps, roll.discoveries) },
    { label: "Opportunity to win", v: rate(roll.searches_won, roll.qualified_opps) },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Performance"
        title="Where the desk is losing time"
        lede="A provisional SourceWhale rollup. The counters are only what SourceWhale reported, and the Thursday review below is what the numbers are for."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[var(--md-on-surface-variant)]">Period</span>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={p === "WEEK" ? "/performance" : `/performance?period=${p}`}
            aria-current={p === period ? "true" : undefined}
            className={`chip transition-colors duration-200 ${
              p === period
                ? "bg-[var(--md-primary)] text-[var(--md-on-primary)]"
                : "hover:bg-[color-mix(in_oklab,var(--md-primary)_16%,var(--md-secondary-container))]"
            }`}
          >
            {p}
          </Link>
        ))}
        <span className="ml-auto text-[12.5px] text-[var(--md-on-surface-muted)]">
          {roll.weeks ?? 0} week{(roll.weeks ?? 0) === 1 ? "" : "s"} reported in this period
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="BD calls" value={roll.bd_calls ?? "--"} />
        <Stat label="Conversations" value={roll.client_conversations ?? "--"} />
        <Stat label="Discoveries" value={roll.discoveries ?? "--"} />
        <Stat label="Qualified opps" value={roll.qualified_opps ?? "--"} />
        <Stat label="Commercial asks" value={roll.commercial_asks ?? "--"} />
        <Stat label="Searches won" value={roll.searches_won ?? "--"} />
        <Stat
          label="Pipeline"
          value={roll.pipeline_usd ? `$${Number(roll.pipeline_usd).toLocaleString()}` : "--"}
        />
        <Stat label="Placements" value={roll.placements ?? "--"} />
      </div>

      <div className="mb-7">
        <Card>
          <CardHeader title="Conversion" sub="Each stage against the one before it" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            {rates.map((r) => (
              <div key={r.label} className="well px-4 py-3.5">
                <div className="placard text-[12px] text-[var(--md-on-surface-variant)]">
                  {r.label}
                </div>
                <div className="readout mt-1.5 text-[24px] leading-none text-[var(--md-primary)]">
                  {r.v == null ? (
                    <span className="text-[15px] text-[var(--md-on-surface-muted)]">
                      not reported
                    </span>
                  ) : (
                    `${r.v}%`
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5">
            <NoticeLine>
              Full SourceWhale ingestion is not built yet, so calls, email and LinkedIn activity are
              not all captured here. A rate with no denominator reads as not reported rather than
              zero, because a zero would be a number nobody measured.
            </NoticeLine>
          </div>
        </Card>
      </div>

      <h2 className="display mb-3 text-[17px]">Thursday review</h2>

      {weeks.length === 0 ? (
        <Card>
          <EmptyState
            title="No weeks recorded"
            body="Nothing has been loaded into the performance tab for this organization yet."
          />
        </Card>
      ) : (
        <ol className="flex flex-col gap-4">
          {weeks.map((w) => (
            <li key={w.id}>
              <Card>
                <CardHeader
                  title={`Week ending ${formatDate(w.week_ending) ?? w.week_ending}`}
                  sub={
                    w.top_10_ready == null
                      ? undefined
                      : w.top_10_ready
                        ? "Top 10 were ready"
                        : "Top 10 were not ready"
                  }
                />
                <div className="flex flex-col gap-4 px-5 pb-5">
                  {w.choke_point ? (
                    <Field label="Biggest choke point" value={w.choke_point} emphasis />
                  ) : null}
                  {w.evidence ? <Field label="Evidence" value={w.evidence} /> : null}
                  {w.hypothesis ? <Field label="Hypothesis" value={w.hypothesis} /> : null}
                  {w.countermeasure ? (
                    <Field label="Countermeasure" value={w.countermeasure} accent />
                  ) : null}

                  {(w.priority_1 || w.priority_2 || w.priority_3 || w.research_tasking) && (
                    <div className="well px-4 py-3.5">
                      <div className="placard mb-2 text-[12px] text-[var(--md-on-surface-variant)]">
                        Direction out of the review
                      </div>
                      <ol className="flex flex-col gap-1.5 text-[13px]">
                        {[w.priority_1, w.priority_2, w.priority_3]
                          .filter(Boolean)
                          .map((p, i) => (
                            <li key={i} className="flex gap-2.5">
                              <span className="readout shrink-0 text-[var(--md-on-surface-muted)]">
                                {i + 1}
                              </span>
                              <span>{p}</span>
                            </li>
                          ))}
                      </ol>
                      {w.research_tasking ? (
                        <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--md-on-surface-variant)]">
                          <span className="text-[var(--md-on-surface-muted)]">Friday tasking: </span>
                          {w.research_tasking}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-[var(--md-radius-md)] bg-[var(--md-primary-container)] px-4 py-3.5"
          : undefined
      }
    >
      <div
        className={`placard mb-1.5 text-[12px] ${
          accent ? "text-[var(--md-on-primary-container)]" : "text-[var(--md-on-surface-variant)]"
        }`}
      >
        {label}
      </div>
      <p
        className={`prose-measure leading-[1.6] ${emphasis ? "text-[15px]" : "text-[13.5px]"} ${
          accent ? "text-[var(--md-on-primary-container)]" : "text-[var(--md-on-surface-variant)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
