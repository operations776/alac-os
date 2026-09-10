import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getOrgId, signalHeat, heatCounts } from "@/lib/server/queries/desk";
import {
  Card, EmptyState, GaugeRow, NoticeLine, PageHeader, Stat, formatDate, formatFigure,
} from "@/components/ui/primitives";
import { HEAT_COMPONENTS, HeatDelta } from "@/components/ui/desk";
import { DESK } from "@/config/desk.mjs";
import { Row } from "@/components/ui/clickable";
import { Dismiss, Restore } from "@/components/ui/dismiss";
import { DISMISS_REASONS } from "@/config/dismiss-reasons.mjs";
import { WhySignal } from "@/components/ui/explain";

export const dynamic = "force-dynamic";

/** The provider's category codes, in words a reader does not have to decode. */
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

/** Money, short. $250,000,000 is unreadable in a chip; $250M is not. */
function formatMoney(v: string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/.0$/, "")}B`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${n}`;
}

// SIGNAL HEAT. The second scoring system, and the one this app actually
// computes against.
//
// The TAM final score answers "is this account qualified", which is settled
// upstream and never changed here. Heat answers a different question: did
// something just happen that changes the timing. The two are shown together
// because the gap between them is the point, and the gap is what the desk acts
// on: a signal well above its account's TAM rank is a company to move on now.

const RANGES = [
  { key: "today", days: 1, label: "Today" },
  { key: "week", days: 7, label: "This week" },
  { key: "month", days: 30, label: "This month" },
] as const;

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; all?: string; unlinked?: string; dismissed?: string }>;
}) {
  const params = await searchParams;
  const range = RANGES.find((r) => r.key === params.range) ?? RANGES[2];
  const showWeak = params.all === "1";
  const unlinkedOnly = params.unlinked === "1";
  const showDismissed = params.dismissed === "1";
  const href = (r: string, all: boolean, unlinked: boolean, dismissed = showDismissed) => {
    const p = new URLSearchParams();
    if (r !== "month") p.set("range", r);
    if (all) p.set("all", "1");
    if (unlinked) p.set("unlinked", "1");
    if (dismissed) p.set("dismissed", "1");
    const s = p.toString();
    return s ? `/signals?${s}` : "/signals";
  };
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org before opening signals." />
        </Card>
      </div>
    );
  }

  const [signals, stats] = await Promise.all([
    signalHeat(orgId, {
      // The dismissed view ignores the window and the floor, for the same
      // reason the roles one does: he has to be able to find all of them.
      days: showDismissed ? 365 : range.days,
      minHeat: showWeak || showDismissed ? 0 : DESK.SIGNAL_MIN_HEAT,
      limit: 100,
      unlinkedOnly,
      dismissedOnly: showDismissed,
    }),
    heatCounts(orgId, range.days, DESK.SIGNAL_MIN_HEAT),
  ]);

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Signal heat"
        title="What just changed"
        lede={`What changed at the companies on your list, strongest first. Signals under ${DESK.SIGNAL_MIN_HEAT} are kept and hidden: the system processes everything, the screen shows what clears the bar.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={href(r.key, showWeak, unlinkedOnly)}
            aria-current={r.key === range.key ? "true" : undefined}
            className={`chip transition-colors ${r.key === range.key ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]" : "hover:bg-[var(--alac-surface-2)]"}`}
          >
            {r.label}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {stats.dismissed > 0 || showDismissed ? (
            <Link
              href={href(range.key, showWeak, unlinkedOnly, !showDismissed)}
              className={`chip transition-colors ${showDismissed ? "bg-[var(--alac-warn-soft)] text-[var(--alac-warn)]" : "hover:bg-[var(--alac-surface-2)]"}`}
              title={showDismissed ? "Back to the live board" : "The signals you took off the board. Nothing is deleted"}
            >
              {showDismissed ? "Showing dismissed" : `${stats.dismissed} dismissed`}
            </Link>
          ) : null}
          {unlinkedOnly ? (
            <Link href={href(range.key, showWeak, false)} className="chip">Showing companies not on the list · clear</Link>
          ) : null}
          <Link
            href={href(range.key, !showWeak, unlinkedOnly)}
            className={`chip transition-colors ${showWeak ? "bg-[var(--alac-surface-2)] text-[var(--alac-text)]" : "hover:bg-[var(--alac-surface-2)]"}`}
            title={showWeak ? "Back to signals that clear the bar" : `Also show the ${stats.weak} signals under ${DESK.SIGNAL_MIN_HEAT}`}
          >
            {showWeak ? "Showing everything" : `Show the ${stats.weak} weaker`}
          </Link>
        </span>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label={`Changed ${range.label.toLowerCase()}`}
          value={stats.total - stats.weak}
          hint={`clear the bar, ${stats.weak} do not`}
          href={href(range.key, false, false)}
        />
        <Stat
          label="More urgent than rank"
          value={stats.hotter_than_tam}
          hint="companies whose news outran their fit score"
          href="/queue?hotter=1"
        />
        <Stat
          label="Not on the list yet"
          value={stats.unlinked}
          hint="companies with news that are not in the TAM"
          tone={stats.unlinked > 0 ? "warn" : undefined}
          href={href(range.key, showWeak, true)}
        />
      </div>

      {stats.unlinked > 0 ? (
        <div className="mb-6">
          <NoticeLine>
            {stats.unlinked} of these companies produced a signal but are not in the scored TAM yet,
            so they have no priority, no final score, and no row in the account queue. They are ranked
            here anyway: a company that has just raised or won a contract is exactly the one the TAM
            has not caught up with.
          </NoticeLine>
        </div>
      ) : null}

      {signals.length === 0 ? (
        <Card>
          <EmptyState
            title="No signals"
            body="The signal log is empty for this organization. Run the desk import to load it."
          />
        </Card>
      ) : (
        <ol className="flex flex-col gap-4">
          {signals.map((s, i) => {
            // The stored total and the six components are both shown. If they
            // ever disagree the row says so rather than picking one, which is
            // what keeps the breakdown an audit trail instead of decoration.
            const parts = HEAT_COMPONENTS.map((c) => ({
              ...c,
              value: (s[c.key as keyof typeof s] as number | null) ?? 0,
            }));
            const sum = parts.reduce((n, p) => n + p.value, 0);
            const disagrees = s.heat_score != null && sum !== s.heat_score;

            return (
              <Row as="li" key={s.id} href={s.account_id ? `/queue/${s.account_id}` : "/signals"}>
                <Card>
                  <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="readout text-[13px] text-[var(--alac-text-3)]">
                          {i + 1}
                        </span>
                        {s.account_id ? (
                          <Link
                            href={`/queue/${s.account_id}`}
                            className="link display text-[18px] font-medium"
                          >
                            {s.company_name}
                          </Link>
                        ) : (
                          <>
                            <span className="display text-[18px]">{s.company_name}</span>
                            <Link
                              href={`/queue/new?name=${encodeURIComponent(s.company_name)}`}
                              className="btn btn-secondary"
                            >
                              Add to the list
                            </Link>
                          </>
                        )}
                        <span className="readout text-[13px] text-[var(--alac-text-3)]">
                          {formatDate(s.signal_date)}
                        </span>
                        {s.source === "predictleads" ? (
                          <span
                            className="chip bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]"
                            title="Found by the system, not typed in"
                          >
                            Found automatically
                          </span>
                        ) : s.source === "workbook" ? (
                          <span className="chip" title="Entered by hand from the workbook">
                            From the workbook
                          </span>
                        ) : null}
                        {s.account_id ? (
                          <span className="chip" title="Which band the company sits in">
                            {s.work_band === "now" ? "Work now" : s.work_band === "next" ? "Up next" : s.work_band === "backlog" ? "Backlog" : "Not ranked"}
                          </span>
                        ) : null}
                        {s.hq ? (
                          <span className="text-[12.5px] text-[var(--alac-text-3)]">
                            {s.hq}
                          </span>
                        ) : null}
                      </div>

                      <p className="prose-measure mt-2.5 text-[14px] leading-[1.6]">
                        {s.what_happened}
                      </p>
                      {/* The full account of what changed. One line is enough
                          to sort the board, not enough to decide from. */}
                      {s.detail ? (
                        <p className="prose-measure mt-2 text-[13px] leading-[1.65] text-[var(--alac-text-2)]">
                          {s.detail}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {s.amount_usd ? (
                          <span className="chip bg-[var(--alac-good-soft)] text-[var(--alac-good)]">
                            {formatMoney(s.amount_usd)}
                          </span>
                        ) : null}
                        {s.person_name ? (
                          <span className="chip" title={s.person_title ?? undefined}>
                            {s.person_name}
                            {s.person_title ? `, ${s.person_title}` : ""}
                          </span>
                        ) : null}
                        {s.category ? (
                          <span className="chip text-[var(--alac-text-3)]">
                            {CATEGORY_LABEL[s.category] ?? s.category.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {formatFigure(s.the_number) ? (
                          <span className="chip bg-[var(--alac-accent-soft)] text-[var(--alac-accent-light)]">
                            {formatFigure(s.the_number)}
                          </span>
                        ) : null}
                        {s.recommended_move ? (
                          <span className="chip">{s.recommended_move}</span>
                        ) : null}
                      </div>

                      {s.best_contact ? (
                        <p className="mt-3 text-[13px] text-[var(--alac-text-2)]">
                          <span className="text-[var(--alac-text-3)]">Best contact: </span>
                          {s.best_contact}
                        </p>
                      ) : null}

                      {s.primary_source ? (
                        <p className="mt-2.5">
                          {/^https?:\/\//i.test(s.primary_source) ? (
                            <a
                              href={s.primary_source}
                              target="_blank"
                              rel="noreferrer"
                              className="link inline-flex items-center gap-1.5 text-[12.5px]"
                            >
                              Source <ExternalLink size={16} strokeWidth={1.5} />
                            </a>
                          ) : (
                            <span className="text-[12.5px] text-[var(--alac-text-3)]">
                              Source: {s.primary_source}
                            </span>
                          )}
                        </p>
                      ) : null}
                    </div>

                    {/* The arithmetic. Six components, their ceilings, and the
                        total they add up to. */}
                    <div className="well px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="placard text-[12px] text-[var(--alac-text-2)]">
                          Heat score
                        </span>
                        <span className="readout text-[26px] leading-none text-[var(--alac-accent)]">
                          {s.heat_score ?? "--"}
                          <span className="text-[13px] text-[var(--alac-text-3)]"> / 100</span>
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-4">
                        {showDismissed
                          ? <Restore kind="signal" refId={s.id} />
                          : <Dismiss kind="signal" refId={s.id} reasons={DISMISS_REASONS.signal} />}
                        <WhySignal
                          signal={s}
                          score={s.heat_score}
                          terms={parts.map((p) => ({ term: p.label, points: p.value, input: `out of ${p.max}` }))}
                          label="Why this score"
                        />
                      </div>

                      <div className="mt-3.5 flex flex-col gap-2.5">
                        {parts.map((p) => (
                          <GaugeRow key={p.key} label={p.label} value={p.value} max={p.max} />
                        ))}
                      </div>

                      <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-[var(--alac-line)] pt-3">
                        <span className="text-[13px] text-[var(--alac-text-2)]">
                          Against TAM {s.tam_final_score ? Math.round(Number(s.tam_final_score)) : "--"}
                        </span>
                        <HeatDelta delta={s.heat_vs_tam} />
                      </div>

                      {disagrees ? (
                        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--alac-warn)]">
                          The components add to {sum} and the stored heat score is {s.heat_score}. Both
                          are shown exactly as recorded. A gap means the row was scored by a different
                          model version than the components describe.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </Row>
            );
          })}
        </ol>
      )}
    </div>
  );
}
