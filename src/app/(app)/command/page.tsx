import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { getOrgId, commandBoard, roleFloor, type DeskRow } from "@/lib/server/queries/desk";
import { DESK, nextPullAt } from "@/config/desk.mjs";
import { Card, EmptyState, PageHeader, formatDate } from "@/components/ui/primitives";
import { NextMove, LifecycleChip, BoardSection } from "@/components/ui/desk";
import { Row } from "@/components/ui/clickable";
import { WhyMove, WhySignal, WhyRole } from "@/components/ui/explain";
import { MarketPulse } from "@/components/ui/market-pulse";
import { Hint } from "@/components/ui/hint";
import { Dismiss } from "@/components/ui/dismiss";
import { DISMISS_REASONS } from "@/config/dismiss-reasons.mjs";
import { setMark } from "../queue/[id]/tracker";
import { acceptRecommendation, declineRecommendation } from "../queue/[id]/portfolio";
import { TeamToday } from "@/components/ops/team-today";

export const dynamic = "force-dynamic";

// TODAY. Four questions, in his words, and nothing else:
//   What matters?            up to five signals that clear the bar
//   What am I working on?    his list, with the next move on each
//   Why does it matter?      a Why on every number
//   What do I do next?       five live leads, each one a call
//
// The system processes everything. The screen shows what changes a decision.
// Everything else is one click away and never on this page.

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
};

/**
 * The clock, read once per request. A server component renders once per
 * request, so the time is a request input rather than render impurity; it is
 * read here, outside the component body, to keep that fact explicit.
 */
function clock(rolesPulledAt: string | null) {
  const now = new Date();
  return {
    next_pull: nextPullAt(now),
    today: now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    stale: rolesPulledAt ? (now.getTime() - new Date(rolesPulledAt).getTime()) / 86_400_000 > 4 : true,
  };
}

function ago(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const money = (v: string | null) => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`;
};

export default async function CommandPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card><EmptyState title="No organization" body="Seed an org before opening the board." /></Card>
      </div>
    );
  }

  const floor = await roleFloor(orgId, DESK.ROLE_TOP_SHARE);
  const board = await commandBoard(orgId, floor);
  const { now, next, recommended, signals, leads, counts } = board;
  const { next_pull, today, stale } = clock(counts.roles_pulled_at);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow={today}
        title="What to work on"
        lede={`${counts.on_list} companies on your list, ${counts.strong_signals} signals that clear the bar this month, ${counts.top_roles_week} top roles this week. Everything below is live from the last pull.`}
      />

      {/* One line on the data, not a row of counters. Amber if it is old. */}
      <p className={`mb-6 text-[12.5px] ${stale ? "text-[var(--alac-warn)]" : "text-[var(--alac-text-3)]"}`}>
        {stale ? "Data is over four days old. " : ""}
        Roles pulled {formatDate(counts.roles_pulled_at) ?? "never"}, signals {formatDate(counts.signals_pulled_at) ?? "never"}.
        {next_pull ? ` Next pull ${next_pull.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC.` : ""}
        {counts.with_gaps > 0 ? (
          <>
            {" "}
            <Link href="/queue?band=now&gaps=1" className="link">
              {counts.with_gaps} on your list {counts.with_gaps === 1 ? "has" : "have"} missing data
            </Link>
            .
          </>
        ) : null}
        {counts.on_hold > 0 ? (
          <>
            {" "}
            <Link href="/queue?disposition=Hold" className="link">{counts.on_hold} on hold</Link>.
          </>
        ) : null}
      </p>

      <TeamToday />

      {/* 1. WHAT MATTERS. Five at most, none below the bar. */}
      <div className="mb-7">
        <BoardSection
          title="What matters"
          sub={`Signals at ${DESK.SIGNAL_MIN_HEAT} or above in the last ${DESK.SIGNAL_FRESH_DAYS} days. Weaker ones are kept, not shown`}
          href="/signals"
          hrefLabel="All signals"
        >
          <Card className="overflow-hidden">
            {signals.length === 0 ? (
              <EmptyState
                title="Nothing cleared the bar"
                body={`No signal in the last ${DESK.SIGNAL_FRESH_DAYS} days scored ${DESK.SIGNAL_MIN_HEAT} or above at a company you are working. That is the honest answer, not a gap.`}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <th className="px-5 py-2 text-right"><Hint label="Urgency" text="Out of 100: how directly the event implies hiring, how recent, how big, and how sure the provider is. Why opens the arithmetic." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Company" text="Opens the company. A company not on your list can be added from here." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="What happened" text="The event, in the provider's words, with the amount where one was reported." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="When" text="When the event happened, not when we found it." /></th>
                      <th className="px-4 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s) => (
                      <Row
                        key={s.id}
                        href={s.account_id ? `/queue/${s.account_id}` : `/queue/new?name=${encodeURIComponent(s.company_name)}`}
                        className="row-hover border-b border-[var(--alac-line)] last:border-0"
                      >
                        <td className="readout px-5 py-3 text-right align-top text-[15px] text-[var(--alac-accent)]">
                          {s.heat_score}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="text-[14px] font-medium">{s.company_name}</span>
                          <div className="mt-0.5 text-[12px] text-[var(--alac-text-3)]">
                            {s.category ? CATEGORY_LABEL[s.category] ?? s.category.replace(/_/g, " ") : "Signal"}
                          </div>
                          {!s.account_id ? (
                            <span className="mt-1 inline-block chip bg-[var(--alac-warn-soft)] text-[var(--alac-warn)]">
                              Not on the list, add
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-[13px] leading-snug text-[var(--alac-text-2)]">
                          {s.what_happened}
                          {s.amount_usd ? (
                            <span className="ml-2 chip bg-[var(--alac-good-soft)] text-[var(--alac-good)]">
                              {money(s.amount_usd)}
                            </span>
                          ) : null}
                        </td>
                        <td className="readout px-4 py-3 align-top text-[12px] text-[var(--alac-text-3)]">
                          {ago(s.signal_date)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="flex items-center gap-3">
                            <WhySignal signal={s} score={s.heat_score} label="Why" />
                            <Dismiss kind="signal" refId={s.id} reasons={DISMISS_REASONS.signal} />
                          </span>
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

      {/* 2. WHAT DO I DO NEXT. Five live leads, each a call, each disappears when ticked. */}
      <div className="mb-7">
        <BoardSection
          title={`${DESK.LIVE_LEADS_PER_DAY} live leads today`}
          sub={`The hardest to fill roles that went up this week, difficulty ${DESK.LEAD_MIN_DIFFICULTY} or above. Tick one when you have raised it and the next one takes its place`}
          href="/roles"
          hrefLabel="All top roles"
        >
          <Card className="overflow-hidden">
            {leads.length === 0 ? (
              <EmptyState
                title="No new top roles this week"
                body="Nothing hard to fill was posted at a company on your list in the last week, or every one has been raised already. Open roles has the month."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <th className="px-5 py-2 text-left"><Hint label="Raised" text="Tick when you have raised this role. It leaves the list and the next one takes its place." /></th>
                      <th className="px-4 py-2 text-right"><Hint label="Score" text="Commercial score out of 100: how hard to fill, times how long open. Why opens the arithmetic." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Company" text="Opens the company page." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Role" text="The title as the employer posted it. Posting opens their own page." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Salary" text="Where the employer publishes a band." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Posted" text="When the posting first appeared." /></th>
                      <th className="px-4 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((r) => (
                      <Row key={r.id} href={`/queue/${r.account_id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
                        <td className="px-5 py-3 align-top">
                          <form action={setMark}>
                            <input type="hidden" name="accountId" value={r.account_id} />
                            <input type="hidden" name="kind" value="role" />
                            <input type="hidden" name="ref" value={r.id} />
                            <input type="hidden" name="done" value="1" />
                            <button
                              type="submit"
                              role="checkbox"
                              aria-checked={false}
                              aria-label="Raised it, show me the next one"
                              title="Tick when you have raised this role. It leaves the list and the next one takes its place"
                              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border border-[var(--alac-line)] bg-[var(--alac-ground)] hover:border-[var(--alac-accent)]"
                            >
                              <Check size={16} strokeWidth={1.5} className="opacity-0" />
                            </button>
                          </form>
                        </td>
                        <td className="readout px-4 py-3 text-right align-top text-[15px] text-[var(--alac-accent)]">
                          {r.relevance}
                        </td>
                        <td className="px-4 py-3 align-top text-[14px] font-medium">{r.company_name}</td>
                        <td className="px-4 py-3 align-top text-[13.5px]">
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer" className="link inline-flex items-baseline gap-1.5">
                              {r.title}
                              <ExternalLink size={16} strokeWidth={1.5} className="shrink-0 self-center" />
                            </a>
                          ) : (
                            r.title
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-[12px] text-[var(--alac-text-2)]">
                          {r.salary_text ?? "--"}
                        </td>
                        <td className="readout px-4 py-3 align-top text-[12px] text-[var(--alac-text-3)]">
                          {ago(r.first_seen)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="flex items-center gap-3">
                            <WhyRole role={r} label="Why" />
                            <Dismiss kind="role" refId={r.id} reasons={DISMISS_REASONS.role} />
                          </span>
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

      {/* 3. WHAT AM I WORKING ON. His list. The ranking's suggestions sit beside it, never in it. */}
      <div className="mb-7">
        <BoardSection
          title="Your Top 25"
          sub={`${now.length} companies you put here. Each with what to do next`}
          href="/queue?band=now"
          hrefLabel="Open the list"
        >
          <Card className="overflow-hidden">
            {now.length === 0 ? (
              <EmptyState title="Your list is empty" body="Accept a recommendation below, or pin a company from its page." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-[var(--alac-ground)]">
                      <th className="px-5 py-2 text-left"><Hint label="Company" text="On your Top 25 because you put it there. The ranking never moves it." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Stage" text="Where it is in your Kanban: Target, Researching, Pending review, Approved, then SourceWhale." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Next move" text="One instruction, computed from the stage, the roles, the latest signal and who you know. Why opens the reasons." /></th>
                      <th className="px-4 py-2 text-left"><Hint label="Last touch" text="The last message you marked sent, or the latest note." /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {now.map((a) => (
                      <ListRow key={a.id} a={a} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </BoardSection>
      </div>

      {recommended.length > 0 ? (
        <div className="mb-7">
          <BoardSection
            title="Recommended for your list"
            sub="The ranking would add these. Accept puts it on your list; decline keeps it off until something new happens"
            href="/queue?recommended=1"
            hrefLabel="See all"
          >
            <Card className="overflow-hidden">
              <ul className="flex flex-col">
                {recommended.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--alac-line)] px-5 py-3 last:border-0">
                    <Link href={`/queue/${a.id}`} className="link min-w-[160px] text-[14px] font-medium">{a.company_name}</Link>
                    <span className="chip">{a.recommended_for === "now" ? "for Top 25" : "for Next 25"}</span>
                    <span className="min-w-[200px] flex-1 text-[12.5px] text-[var(--alac-text-2)]">{a.work_reason}</span>
                    <form action={acceptRecommendation}><input type="hidden" name="accountId" value={a.id} /><button className="btn btn-primary">Accept</button></form>
                    <form action={declineRecommendation}><input type="hidden" name="accountId" value={a.id} /><button className="btn btn-ghost">Decline</button></form>
                  </li>
                ))}
              </ul>
            </Card>
          </BoardSection>
        </div>
      ) : null}

      {next.length > 0 ? (
        <div className="mb-7">
          <BoardSection title="Your Next 25" sub={`${next.length} on the bench, worked after the Top 25`} href="/queue?band=next" hrefLabel="Open the list">
            <Card className="px-5 py-3">
              <p className="text-[13px] leading-relaxed text-[var(--alac-text-2)]">
                {next.slice(0, 12).map((a, i) => (
                  <span key={a.id}>
                    <Link href={`/queue/${a.id}`} className="link">{a.company_name}</Link>
                    {i < Math.min(next.length, 12) - 1 ? ", " : ""}
                  </span>
                ))}
                {next.length > 12 ? ` and ${next.length - 12} more` : ""}
              </p>
            </Card>
          </BoardSection>
        </div>
      ) : null}

      {/* 4. THE MARKET. From the roles that clear the bar, and nothing else. */}
      <div className="mb-7">
        <BoardSection
          title="Where the demand is"
          sub={`From the top tenth of live roles, score ${floor} and above. Click a bar to open the roles behind it`}
          href="/roles?range=month"
          hrefLabel="This month's top roles"
        >
          <Card className="px-5 py-5">
            <MarketPulse cities={board.by_city} disciplines={board.by_discipline} />
          </Card>
        </BoardSection>
      </div>
    </div>
  );
}

function ListRow({ a }: { a: DeskRow }) {
  return (
    <Row href={`/queue/${a.id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
      <td className="px-5 py-2.5 align-top">
        <span className="text-[14px] font-medium">{a.company_name}</span>
        {a.domain ? <div className="text-[12px] text-[var(--alac-text-3)]">{a.domain}</div> : null}
      </td>
      <td className="px-4 py-2.5 align-top"><LifecycleChip row={a} /></td>
      <td className="px-4 py-2.5 align-top">
        <NextMove row={a} compact />
        <span className="mt-1 block"><WhyMove account={a} /></span>
      </td>
      <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
        {a.last_contacted_at
          ? `Messaged ${a.last_contacted_name ?? "someone"} ${ago(a.last_contacted_at)}`
          : a.last_note
            ? <span className="line-clamp-1" title={a.last_note}>Note: {a.last_note}</span>
            : <span className="text-[var(--alac-text-3)]">nothing yet</span>}
      </td>
    </Row>
  );
}
