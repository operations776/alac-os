import Link from "next/link";

import {
  getOrgId, nextWeek, rankedBand, deskCounts, signalHeat, heatCounts,
  performanceRollup, type QueueRow, type Period,
} from "@/lib/server/queries/desk";
import {
  Card, EmptyState, NoticeLine, PageHeader, Stat, Th,
} from "@/components/ui/primitives";
import {
  ExecutionStages, HeatDelta, LinkCell, MotionChip, PrepChip, PriorityChip,
  ScoreCell, BoardSection,
} from "@/components/ui/desk";

export const dynamic = "force-dynamic";

// COMMAND BOARD. View only, exactly as the workbook defines it: every number
// here is a ranking or a rollup of the ACCOUNT QUEUE, SIGNAL HEAT and
// PERFORMANCE tabs. Nothing is entered on this screen, so nothing on it is
// editable, and that is a property of the model rather than a missing feature.

const PERIODS: Period[] = ["WEEK", "MONTH", "QUARTER", "YEAR"];

// The Friday end state: exactly 10 decision-ready companies, unless Adrian
// directs otherwise. The board states the target so the count means something.
const NEXT_WEEK_TARGET = 10;

export default async function CommandPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org before opening the board." />
        </Card>
      </div>
    );
  }

  const period = (PERIODS.includes(params.period as Period) ? params.period : "WEEK") as Period;

  const [week, top25, next25, counts, heat, heatStats, perf] = await Promise.all([
    nextWeek(orgId),
    rankedBand(orgId, 0),
    rankedBand(orgId, 25),
    deskCounts(orgId),
    signalHeat(orgId, 8),
    heatCounts(orgId),
    performanceRollup(orgId, period),
  ]);

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Command board"
        title="The operating picture"
        lede="Next week is set in the account queue, the bands rank themselves by priority then final score, and the performance snapshot follows the period selector. Nothing is typed on this screen."
      />

      {/* Performance snapshot, auto from PERFORMANCE. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[var(--alac-text-2)]">Performance period</span>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={p === "WEEK" ? "/command" : `/command?period=${p}`}
            aria-current={p === period ? "true" : undefined}
            className={`chip transition-colors duration-200 ${
              p === period
                ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]"
                : "hover:bg-[color-mix(in_oklab,var(--alac-accent)_16%,var(--alac-surface-2))]"
            }`}
          >
            {p}
          </Link>
        ))}
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="BD calls" value={perf.bd_calls ?? "--"} hint={period.toLowerCase()} />
        <Stat label="Conversations" value={perf.client_conversations ?? "--"} />
        <Stat label="Discoveries" value={perf.discoveries ?? "--"} />
        <Stat label="Qualified opps" value={perf.qualified_opps ?? "--"} />
        <Stat label="Searches won" value={perf.searches_won ?? "--"} />
        <Stat
          label="Pipeline"
          value={perf.pipeline_usd ? `$${Number(perf.pipeline_usd).toLocaleString()}` : "--"}
        />
        <Stat
          label="Ready for QC"
          value={counts.ready_for_qc}
          hint="waiting on Adrian"
          tone={counts.ready_for_qc > 0 ? "good" : undefined}
        />
      </div>

      {(perf.weeks ?? 0) === 0 ? (
        <div className="mb-7">
          <NoticeLine>
            No SourceWhale weeks fall inside this {period.toLowerCase()}. The counters read as not
            reported rather than zero, because the workbook records only what SourceWhale actually
            exported and a zero here would be an invented figure.
          </NoticeLine>
        </div>
      ) : null}

      {/* NEXT WEEK */}
      <div className="mb-7">
        <BoardSection
          title="Next week"
          sub={
            <>
              {week.length} of {NEXT_WEEK_TARGET} target
              {week.length !== NEXT_WEEK_TARGET ? (
                <span className="text-[var(--alac-warn)]">
                  {" "}
                  &middot; {week.length > NEXT_WEEK_TARGET ? "over" : "under"} by{" "}
                  {Math.abs(week.length - NEXT_WEEK_TARGET)}
                </span>
              ) : null}
            </>
          }
          href="/queue?next=1"
          hrefLabel="Open in queue"
        >
          <Card className="overflow-hidden">
            {week.length === 0 ? (
              <EmptyState
                title="Nothing set for next week"
                body="No company is flagged Next Week in the account queue. Friday close should leave exactly ten decision-ready companies here."
              />
            ) : (
              <QueueTable rows={week} showNextAction />
            )}
          </Card>
        </BoardSection>
      </div>

      {/* SIGNAL HEAT */}
      <div className="mb-7">
        <BoardSection
          title="Signal heat"
          sub={
            <>
              {heatStats.total} scored &middot; {heatStats.hotter_than_tam} hotter than their TAM rank
              {heatStats.unlinked > 0 ? ` · ${heatStats.unlinked} not yet in the TAM` : ""}
            </>
          }
          href="/signals"
          hrefLabel="All signals"
        >
          <Card className="overflow-hidden">
            {heat.length === 0 ? (
              <EmptyState
                title="No signals scored"
                body="The signal log is empty for this organization. Run the desk import to load it."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <Th align="right">Heat</Th>
                      <Th>Company</Th>
                      <Th>What happened</Th>
                      <Th align="right">vs TAM</Th>
                      <Th>Move</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {heat.map((s) => (
                      <tr
                        key={s.id}
                        className="row-hover border-b border-[var(--alac-line)] last:border-0"
                      >
                        <td className="readout px-4 py-2.5 text-right align-top text-[14px] text-[var(--alac-accent)]">
                          {s.heat_score ?? "--"}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {s.account_id ? (
                            <Link
                              href={`/queue/${s.account_id}`}
                              className="link text-[14px] font-medium"
                            >
                              {s.company_name}
                            </Link>
                          ) : (
                            <span
                              className="text-[14px] font-medium"
                              title="Not in the scored TAM yet"
                            >
                              {s.company_name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 align-top text-[13px] leading-snug text-[var(--alac-text-2)]">
                          <span className="line-clamp-2">{s.what_happened}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top">
                          <HeatDelta delta={s.heat_vs_tam} />
                        </td>
                        <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                          <span className="line-clamp-2">{s.recommended_move ?? "--"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </BoardSection>
      </div>

      {/* TOP 25 / NEXT 25 */}
      <div className="grid gap-5 xl:grid-cols-2">
        <BoardSection title="Top 25" sub={`Priority 1 first, then final score`}>
          <Card className="overflow-hidden">
            <BandList rows={top25} />
          </Card>
        </BoardSection>
        <BoardSection title="Next 25" sub="The bench behind the top 25">
          <Card className="overflow-hidden">
            <BandList rows={next25} />
          </Card>
        </BoardSection>
      </div>

      <p className="mt-6 text-[12.5px] leading-relaxed text-[var(--alac-text-3)]">
        Top 25 and Next 25 are ranked, not stored: priority 1 then 2 then 3, and inside each the
        highest final score first. {counts.unscored} strategic account
        {counts.unscored === 1 ? " is" : "s are"} held out of this ranking because they are not
        finalized in the scored TAM.
      </p>
    </div>
  );
}

function BandList({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Empty"
        body="No account has landed in this band. The ranking needs a priority and a final score from the TAM."
      />
    );
  }
  return (
    <ol className="px-3 pb-3">
      {rows.map((a, i) => (
        <li
          key={a.id}
          className="row-hover flex items-center gap-3 rounded-[var(--alac-radius)] px-3 py-2.5"
        >
          <span className="readout w-5 shrink-0 text-right text-[12.5px] text-[var(--alac-text-3)]">
            {i + 1}
          </span>
          <span className="w-8 shrink-0 text-right">
            <ScoreCell score={a.final_score} />
          </span>
          <Link href={`/queue/${a.id}`} className="link min-w-0 flex-1 truncate text-[14px] font-medium">
            {a.company_name}
          </Link>
          <span className="shrink-0">
            <PrepChip status={a.prep_status} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function QueueTable({ rows, showNextAction }: { rows: QueueRow[]; showNextAction?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="bg-[var(--alac-ground)]">
            <Th align="right">Score</Th>
            <Th>Company</Th>
            <Th>Priority</Th>
            <Th>Motion</Th>
            <Th>Prep</Th>
            <Th>Leads</Th>
            <Th>Battlecard</Th>
            <Th>Execution</Th>
            {showNextAction ? <Th>Next action</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="row-hover border-b border-[var(--alac-line)] last:border-0">
              <td className="px-4 py-2.5 text-right align-top">
                <ScoreCell score={a.final_score} />
              </td>
              <td className="px-4 py-2.5 align-top">
                <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">
                  {a.company_name}
                </Link>
                <div className="readout mt-0.5 text-[12px] text-[var(--alac-text-3)]">
                  {a.record_id}
                </div>
              </td>
              <td className="px-4 py-2.5 align-top">
                <PriorityChip priority={a.priority} />
              </td>
              <td className="px-4 py-2.5 align-top">
                <MotionChip motion={a.recommended_motion} />
              </td>
              <td className="px-4 py-2.5 align-top">
                <PrepChip status={a.prep_status} />
              </td>
              <td className="px-4 py-2.5 align-top">
                <LinkCell href={a.sales_nav_url} label="Leads" />
              </td>
              <td className="px-4 py-2.5 align-top">
                <LinkCell href={a.battlecard_url} label="Card" />
              </td>
              <td className="px-4 py-2.5 align-top">
                <ExecutionStages heyreach={a.heyreach_stage} sourcewhale={a.sourcewhale_stage} />
              </td>
              {showNextAction ? (
                <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                  {a.next_action ?? <span className="text-[var(--alac-text-3)]">--</span>}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
