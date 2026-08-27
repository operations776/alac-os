import Link from "next/link";
import { ExternalLink } from "lucide-react";

import {
  getOrgId, commandBoard, type DeskRow, type QueueRow, type Period,
} from "@/lib/server/queries/desk";
import { DESK } from "@/config/desk.mjs";
import { Row } from "@/components/ui/clickable";
import {
  Card, EmptyState, NoticeLine, PageHeader, Stat, Th, formatDate,
} from "@/components/ui/primitives";
import {
  ExecutionStages, HeatDelta, LinkCell, MotionChip, PrepChip, PriorityChip,
  ScoreCell, BoardSection, NextMove, LifecycleChip,
} from "@/components/ui/desk";

export const dynamic = "force-dynamic";

// TODAY. Every list on this screen is live: the bands come from the last
// refresh of the market map, the signals from the feed, the roles from the
// employers' own boards. Nothing is typed on this screen and nothing on it
// is a fixed list.

const PERIODS: Period[] = ["WEEK", "MONTH", "QUARTER", "YEAR"];

/** The provider's category codes, in words. */
const CATEGORY_LABEL: Record<string, string> = {
  receives_financing: "Raised money",
  increases_headcount_by: "Grew headcount",
  hires: "Hired someone senior",
  leaves: "Someone senior left",
  expands_offices_to: "Opened an office",
  expands_offices_in: "Expanded an office",
  expands_facilities: "Expanded facilities",
  acquires: "Acquired a company",
  signs_new_client: "Won a client",
  launches: "Launched something",
  has_valuation: "New valuation",
  invests_into: "Took investment",
  partners_with: "New partnership",
  closes_offices_in: "Closed an office",
};

function ago(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

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

  const board = await commandBoard(orgId, period);
  const week = board.next_week;
  const now = board.now;
  const next = board.next;
  const heat = board.heat;
  const counts = board.counts;
  const heatStats = board.heat_stats;
  const perf = board.perf;
  const rolesToday = board.roles_today;
  const roleCounts = board.role_counts;
  const banded = now[0]?.banded_at ?? null;

  const calls = now.filter((r) => r.fresh_roles > 0 || r.signal_date != null).length;

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Today"
        title="What to work on"
        lede={`The ${DESK.NOW_SIZE} companies in Work now, each with its next move. Signals and roles are pulled ${DESK.REFRESH}, and the list re-ranks itself on every pull.`}
      />

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Roles posted since yesterday" value={roleCounts.today} hint="at companies you are working" tone={roleCounts.today > 0 ? "good" : undefined} />
        <Stat label="Companies with a reason to call" value={calls} hint={`of ${now.length} in Work now`} />
        <Stat label="Things that changed" value={heatStats.total} hint={`${heatStats.hotter_than_tam} hotter than their rank`} />
        <Stat
          label="Needs your review"
          value={counts.ready_for_qc}
          hint="waiting on you"
          tone={counts.ready_for_qc > 0 ? "good" : undefined}
        />
      </div>

      {banded ? (
        <p className="mb-6 text-[12.5px] text-[var(--alac-text-3)]">
          Ranked {formatDate(banded)}. Roles last pulled {formatDate(roleCounts.pulled_at) ?? "never"}.
        </p>
      ) : null}

      {/* WORK NOW, with the next move. The whole product on one list. */}
      <div className="mb-7">
        <BoardSection
          title="Work now"
          sub={`${now.length} companies, ranked by fit, what changed, and who you know`}
          href="/targets"
          hrefLabel="See why each is here"
        >
          <Card className="overflow-hidden">
            {now.length === 0 ? (
              <EmptyState
                title="Nothing ranked yet"
                body="Run the refresh to rank the market into Work now, Up next and Backlog."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <Th align="right">#</Th>
                      <Th>Company</Th>
                      <Th>Stage</Th>
                      <Th>Next move</Th>
                      <Th align="right">New roles</Th>
                      <Th>Latest change</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {now.map((a, i) => (
                      <Row key={a.id} href={`/queue/${a.id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
                        <td className="readout px-4 py-2.5 text-right align-top text-[12.5px] text-[var(--alac-text-3)]">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">
                            {a.company_name}
                          </Link>
                          {a.domain ? (
                            <div className="text-[12px] text-[var(--alac-text-3)]">{a.domain}</div>
                          ) : null}
                          <div className="mt-0.5 text-[12px] text-[var(--alac-text-3)]">
                            Fit {a.final_score != null ? Math.round(Number(a.final_score)) : "--"}
                            {a.heat_score != null ? ` · Urgency ${a.heat_score}` : ""}
                            {a.decision_makers > 0 ? ` · ${a.decision_makers} decision ${a.decision_makers === 1 ? "maker" : "makers"} known` : ""}
                          </div>
                          {a.last_contacted_at ? (
                            <div className="mt-0.5 text-[12px] text-[var(--alac-good)]">
                              Messaged {a.last_contacted_name ?? "someone"} {ago(a.last_contacted_at)}
                              {a.contacted_count > 1 ? `, ${a.contacted_count} people so far` : ""}
                            </div>
                          ) : null}
                          {a.last_note ? (
                            <div className="mt-0.5 line-clamp-1 text-[12px] text-[var(--alac-text-3)]" title={a.last_note}>
                              Note: {a.last_note}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 align-top"><LifecycleChip row={a} /></td>
                        <td className="px-4 py-2.5 align-top"><NextMove row={a} /></td>
                        <td className="readout px-4 py-2.5 text-right align-top text-[14px]">
                          {a.fresh_roles > 0 ? (
                            <span className="text-[var(--alac-good)]">{a.fresh_roles}</span>
                          ) : (
                            <span className="text-[var(--alac-text-3)]">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 align-top text-[12.5px] leading-snug text-[var(--alac-text-2)]">
                          {a.signal_text ? (
                            <>
                              <span className="line-clamp-2">{a.signal_text}</span>
                              <span className="readout text-[11.5px] text-[var(--alac-text-3)]">{ago(a.signal_date)}</span>
                            </>
                          ) : (
                            <span className="text-[var(--alac-text-3)]">nothing recorded</span>
                          )}
                        </td>
                      </Row>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </BoardSection>
      </div>

      {/* ROLES POSTED SINCE YESTERDAY */}
      <div className="mb-7">
        <BoardSection
          title="Posted since yesterday"
          sub={`${roleCounts.today} relevant roles, ${roleCounts.week} this week. Nobody else has called about these yet`}
          href="/roles"
          hrefLabel="All open roles"
        >
          <Card className="overflow-hidden">
            {rolesToday.length === 0 ? (
              <EmptyState
                title="Nothing new since yesterday"
                body="No relevant role appeared at a company you are working. The week view on Open roles has the rest."
              />
            ) : (
              <ul className="flex flex-col gap-0.5 px-3 py-2">
                {rolesToday.map((r) => (
                  <Row as="li" key={r.id} href={`/queue/${r.account_id}`} className="row-hover flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--alac-radius-sm)] px-3 py-2">
                    <span className="readout w-7 shrink-0 text-right text-[13px] text-[var(--alac-accent)]" title="Relevance, out of 100">
                      {r.relevance ?? "--"}
                    </span>
                    <Link href={`/queue/${r.account_id}`} className="link shrink-0 text-[13.5px] font-medium">
                      {r.company_name}
                    </Link>
                    <span className="min-w-[200px] flex-1 text-[13.5px]">{r.title}</span>
                    {r.salary_text ? <span className="shrink-0 text-[12px] text-[var(--alac-text-2)]">{r.salary_text}</span> : null}
                    {r.location ? <span className="shrink-0 text-[12px] text-[var(--alac-text-3)]">{r.location}</span> : null}
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="link inline-flex shrink-0 items-center gap-1.5 text-[12px]">
                        Posting <ExternalLink size={16} strokeWidth={1.5} />
                      </a>
                    ) : null}
                  </Row>
                ))}
              </ul>
            )}
          </Card>
        </BoardSection>
      </div>

      {/* WHAT CHANGED, newest first */}
      <div className="mb-7">
        <BoardSection
          title="What changed"
          sub={
            <>
              Newest first &middot; {heatStats.total} on record
              {heatStats.unlinked > 0 ? ` · ${heatStats.unlinked} at companies not on the list` : ""}
            </>
          }
          href="/signals"
          hrefLabel="See all"
        >
          <Card className="overflow-hidden">
            {heat.length === 0 ? (
              <EmptyState title="No signals yet" body="Run the refresh to pull the feed." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <Th>When</Th>
                      <Th>Company</Th>
                      <Th>What happened</Th>
                      <Th align="right">Urgency</Th>
                      <Th>On the list</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {heat.map((s) => (
                      <Row key={s.id} href={s.account_id ? `/queue/${s.account_id}` : `/queue/new?name=${encodeURIComponent(s.company_name)}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
                        <td className="readout px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-3)]">
                          {ago(s.signal_date)}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {s.account_id ? (
                            <Link href={`/queue/${s.account_id}`} className="link text-[14px] font-medium">
                              {s.company_name}
                            </Link>
                          ) : (
                            <span className="text-[14px] font-medium">
                              {s.company_name}{" "}
                              <Link href={`/queue/new?name=${encodeURIComponent(s.company_name)}`} className="link text-[12px] font-normal">
                                add to the list
                              </Link>
                            </span>
                          )}
                          {s.category ? (
                            <div className="mt-0.5 text-[12px] text-[var(--alac-text-3)]">{CATEGORY_LABEL[s.category] ?? s.category}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 align-top text-[13px] leading-snug text-[var(--alac-text-2)]">
                          <span className="line-clamp-2">{s.what_happened}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top">
                          <span className="readout text-[14px] text-[var(--alac-accent)]">{s.heat_score ?? "--"}</span>{" "}
                          <HeatDelta delta={s.heat_vs_tam} />
                        </td>
                        <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                          {s.work_band === "now" ? "Work now" : s.work_band === "next" ? "Up next" : s.work_band === "backlog" ? "Backlog" : "Not ranked"}
                        </td>
                      </Row>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </BoardSection>
      </div>

      {/* NEXT WEEK, the Friday close */}
      <div className="mb-7">
        <BoardSection
          title="Approved for next week"
          sub={
            <>
              {week.length} of {DESK.WEEK_TARGET} target
              {week.length !== DESK.WEEK_TARGET ? (
                <span className="text-[var(--alac-warn)]">
                  {" "}
                  &middot; {week.length > DESK.WEEK_TARGET ? "over" : "under"} by{" "}
                  {Math.abs(week.length - DESK.WEEK_TARGET)}
                </span>
              ) : null}
            </>
          }
          href="/queue?next=1"
          hrefLabel="Open list"
        >
          <Card className="overflow-hidden">
            {week.length === 0 ? (
              <EmptyState
                title="Nothing set for next week"
                body={`No company is flagged Next Week. Friday close should leave ${DESK.WEEK_TARGET} decision-ready companies here, drawn from Work now.`}
              />
            ) : (
              <QueueTable rows={week} />
            )}
          </Card>
        </BoardSection>
      </div>

      {/* UP NEXT */}
      <div className="mb-7">
        <BoardSection title="Up next" sub="The bench. Promoted into Work now as slots free up" href="/targets?band=next" hrefLabel="See all">
          <Card className="overflow-hidden">
            <BandList rows={next} />
          </Card>
        </BoardSection>
      </div>

      {/* RESULTS */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[var(--alac-text-2)]">Results period</span>
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
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="BD calls" value={perf.bd_calls ?? "--"} hint={period.toLowerCase()} />
        <Stat label="Conversations" value={perf.client_conversations ?? "--"} />
        <Stat label="Discoveries" value={perf.discoveries ?? "--"} />
        <Stat label="Qualified opps" value={perf.qualified_opps ?? "--"} />
        <Stat label="Searches won" value={perf.searches_won ?? "--"} />
        <Stat label="Pipeline" value={perf.pipeline_usd ? `$${Number(perf.pipeline_usd).toLocaleString()}` : "--"} />
      </div>
      {(perf.weeks ?? 0) === 0 ? (
        <NoticeLine>
          No SourceWhale weeks fall inside this {period.toLowerCase()}. The counters read as not
          reported rather than zero. They will fill in from SourceWhale once its API key is connected.
        </NoticeLine>
      ) : null}
    </div>
  );
}

function BandList({ rows }: { rows: DeskRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Empty" body="No company has landed in this band yet." />;
  }
  return (
    <ol className="px-3 pb-3">
      {rows.map((a, i) => (
        <Row as="li" key={a.id} href={`/queue/${a.id}`} className="row-hover flex items-center gap-3 rounded-[var(--alac-radius)] px-3 py-2.5">
          <span className="readout w-5 shrink-0 text-right text-[12.5px] text-[var(--alac-text-3)]">{i + 1}</span>
          <span className="w-8 shrink-0 text-right"><ScoreCell score={a.final_score} /></span>
          <Link href={`/queue/${a.id}`} className="link min-w-0 flex-1 truncate text-[14px] font-medium">
            {a.company_name}
          </Link>
          <span className="hidden min-w-0 flex-1 truncate text-[12.5px] text-[var(--alac-text-3)] md:inline">{a.work_reason}</span>
          <span className="shrink-0"><NextMove row={a} compact /></span>
        </Row>
      ))}
    </ol>
  );
}

function QueueTable({ rows }: { rows: QueueRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="bg-[var(--alac-ground)]">
            <Th align="right">Score</Th>
            <Th>Company</Th>
            <Th>Priority</Th>
            <Th>Approach</Th>
            <Th>Progress</Th>
            <Th>Brief</Th>
            <Th>Outreach</Th>
            <Th>Next action</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <Row key={a.id} href={`/queue/${a.id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
              <td className="px-4 py-2.5 text-right align-top"><ScoreCell score={a.final_score} /></td>
              <td className="px-4 py-2.5 align-top">
                <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">{a.company_name}</Link>
                <div className="readout mt-0.5 text-[12px] text-[var(--alac-text-3)]">{a.record_id}</div>
              </td>
              <td className="px-4 py-2.5 align-top"><PriorityChip priority={a.priority} /></td>
              <td className="px-4 py-2.5 align-top"><MotionChip motion={a.recommended_motion} /></td>
              <td className="px-4 py-2.5 align-top"><PrepChip status={a.prep_status} /></td>
              <td className="px-4 py-2.5 align-top"><LinkCell href={a.battlecard_url} label="Card" /></td>
              <td className="px-4 py-2.5 align-top"><ExecutionStages heyreach={a.heyreach_stage} sourcewhale={a.sourcewhale_stage} /></td>
              <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                {a.next_action ?? <span className="text-[var(--alac-text-3)]">--</span>}
              </td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}
