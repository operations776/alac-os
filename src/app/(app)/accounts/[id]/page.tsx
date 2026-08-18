import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import {
  getOrgId, accountById, signalsForAccount, peopleForAccount, latestScoreForAccount,
  type BreakdownTerm,
} from "@/lib/server/queries/portfolio";
import {
  Badge, Blank, Card, CardHeader, EmptyState, Eyebrow, GaugeRow, NoticeLine,
  ScoreReadout, Th, daysAgo, formatDate, formatMoney,
} from "@/components/ui/primitives";
import { ScoreLadder, componentLabel } from "@/components/ui/score-ladder";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const account = await accountById(orgId, id);
  if (!account) notFound();

  const [signals, people, score] = await Promise.all([
    signalsForAccount(orgId, id),
    peopleForAccount(orgId, id),
    latestScoreForAccount(orgId, id),
  ]);

  const terms: BreakdownTerm[] = score?.breakdown?.terms ?? [];
  const byComponent = terms.reduce<Record<string, BreakdownTerm[]>>((acc, t) => {
    (acc[t.component] ??= []).push(t);
    return acc;
  }, {});

  const components = score
    ? [
        { key: "icp_fit", value: score.icp_fit_score, max: 25 },
        { key: "hiring", value: score.hiring_signal_score, max: 25 },
        { key: "timing", value: score.timing_score, max: 20 },
        { key: "relationship", value: score.relationship_score, max: 15 },
        { key: "revenue", value: score.revenue_potential_score, max: 15 },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <Link href="/portfolio" className="btn btn-ghost mb-4 -ml-4">
        <ArrowLeft size={16} strokeWidth={1.5} /> Portfolio
      </Link>

      {/* The identity plate and the primary readout, side by side. */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <Eyebrow>{account.vertical ?? "Account"}</Eyebrow>
          <h1 className="display mt-1.5 flex flex-wrap items-center gap-3 text-[26px] leading-[1.2] sm:text-[32px]">
            {account.company_name}
            {account.tier_locked ? (
              <span
                title="Pinned by a human, the engine may not demote it"
                className="placard inline-flex items-center gap-1.5 rounded-full bg-[var(--md-secondary-container)] px-3 py-1 text-[11.5px] text-[var(--md-on-secondary-container)]"
              >
                <Lock size={16} strokeWidth={1.5} />
                Pinned
              </span>
            ) : null}
          </h1>

          <div className="readout mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--md-on-surface-muted)]">
            {account.domain ? (
              <a
                href={`https://${account.domain}`}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-1.5"
              >
                {account.domain} <ExternalLink size={16} strokeWidth={1.5} />
              </a>
            ) : null}
            {account.hq_location ? <span>{account.hq_location}</span> : null}
            {account.employee_band ? <span>{account.employee_band} employees</span> : null}
            {account.founded_year ? <span>Founded {String(account.founded_year)}</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {account.is_suppressed ? (
              <Badge tone="warn" withIcon>Current client</Badge>
            ) : null}
            {account.tier === "top25" ? <Badge tone="brand">Top 25</Badge> : null}
            {account.tier === "next25" ? <Badge>Next 25</Badge> : null}
            {account.tier === "watch" ? <Badge>Watch</Badge> : null}
          </div>
        </div>

        <ScoreReadout score={score?.score ?? null} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-5">
          {/* Why now leads the page. It is the question the product exists to
              answer, so it gets the largest text and its evidence sits
              directly under it. Position and type size are the emphasis. */}
          <Card>
            <CardHeader
              title="Why now"
              sub={score?.why_now ? undefined : "Reasoning pass has not run for this account yet"}
            />
            <div className="px-5 py-4">
              {score?.why_now ? (
                <p className="prose-measure text-[14px] leading-[1.75]">{score.why_now}</p>
              ) : (
                <p className="prose-measure text-[14px] leading-relaxed text-[var(--md-on-surface-variant)]">
                  No written reasoning yet. The deterministic score below is complete and auditable on its
                  own. The narrative layer is added by a separate pass that must cite the dated signals
                  listed here, and it is never generated without them.
                </p>
              )}

              {signals.length > 0 ? (
                <div className="well mt-5 px-5 py-4">
                  <div className="placard mb-2.5 text-[12px] text-[var(--md-on-surface-variant)]">
                    Evidence on file
                  </div>
                  <ul className="flex flex-col gap-1">
                    {signals.slice(0, 5).map((s, i) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[13.5px]"
                      >
                        <span className="readout w-[18px] shrink-0 text-[12px] text-[var(--md-on-surface-muted)]">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{s.headline}</span>
                        <span className="readout shrink-0 text-[12.5px] text-[var(--md-on-surface-muted)]">
                          {formatDate(s.occurred_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--md-on-surface-muted)]">
                    Source: {signals[0]?.source}. Every claim above is a stored row with a date, not a
                    generated sentence.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          {/* What to do about it, and what would make it a waste of time. Only
              rendered when the reasoning pass actually produced them, so an
              empty state here means "not run", never a fabricated suggestion. */}
          {score?.next_best_action || score?.risks ? (
            <Card>
              <CardHeader
                title="What to do next"
                sub={score.model ? `Written by ${score.model}, grounded in the signals above` : undefined}
              />
              <div className="flex flex-col gap-4 px-5 py-4">
                {score.next_best_action ? (
                  <div className="rounded-[var(--md-radius-md)] bg-[var(--md-primary-container)] px-4 py-3.5">
                    <div className="placard mb-1.5 text-[12px] text-[var(--md-on-primary-container)]">
                      Next best action
                    </div>
                    <p className="prose-measure text-[14px] leading-[1.6] text-[var(--md-on-primary-container)]">
                      {score.next_best_action}
                    </p>
                  </div>
                ) : null}
                {score.risks ? (
                  <div>
                    <div className="placard mb-1.5 text-[12px] text-[var(--md-on-surface-variant)]">
                      Risks
                    </div>
                    <p className="prose-measure text-[14px] leading-[1.6] text-[var(--md-on-surface-variant)]">
                      {score.risks}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* The arithmetic. This is what turns a number into a decision, so it
              is drawn as an instrument: component gauges, then the ladder that
              accumulates every term, then the full term table underneath. */}
          <Card>
            <CardHeader
              title="How this score was calculated"
              sub="Five components, then penalties. Every term is stored, none are inferred here."
            />
            {!score ? (
              <EmptyState
                title="Not scored yet"
                body="This account has no stored score, so there is no arithmetic to show. Run the scoring pass to populate it."
              />
            ) : (
              <>
                <div className="flex flex-col gap-3.5 px-5 py-4">
                  {components.map((c) => (
                    <GaugeRow
                      key={c.key}
                      label={componentLabel(c.key)}
                      value={c.value}
                      max={c.max}
                    />
                  ))}
                  {score.penalty > 0 ? (
                    <div className="mt-1 flex items-baseline justify-between rounded-[var(--md-radius-md)] bg-[var(--md-error-container)] px-4 py-2.5 text-[13.5px]">
                      <span className="text-[var(--md-error)]">Penalties applied</span>
                      <span className="readout text-[var(--md-error)]">
                        &minus;{score.penalty}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* The signature element: every term, accumulating to the total. */}
                <ScoreLadder terms={terms} total={score.score} />

                {/* The same terms as a table, because the ladder shows shape and
                    the table shows the reading. Both, never one instead of the
                    other. */}
                {terms.length > 0 ? (
                  <div className="mx-5 mb-5 overflow-x-auto rounded-[var(--md-radius-md)] bg-[var(--md-surface-container-low)]">
                    <table className="w-full min-w-[620px] border-collapse text-[13px]">
                      <caption className="placard px-4 pb-1 pt-3.5 text-left text-[12px] text-[var(--md-on-surface-variant)]">
                        Term detail, {terms.length} terms
                      </caption>
                      <thead>
                        <tr>
                          <Th>Component</Th>
                          <Th>Term</Th>
                          <Th>Read</Th>
                          <Th align="right">Points</Th>
                          <Th>Why</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byComponent).map(([component, list]) =>
                          list.map((t, i) => (
                            <tr
                              key={`${component}-${t.term}`}
                              className="row-hover"
                            >
                              <td className="px-4 py-2.5 align-top text-[var(--md-on-surface-muted)]">
                                {i === 0 ? componentLabel(component) : ""}
                              </td>
                              <td className="px-4 py-2.5 align-top font-medium">{t.term}</td>
                              <td className="readout px-4 py-2.5 align-top text-[12.5px] text-[var(--md-on-surface-variant)]">
                                {String(t.input)}
                              </td>
                              <td
                                className="readout px-4 py-2.5 text-right align-top"
                                style={{
                                  color:
                                    component === "penalty"
                                      ? "var(--md-error)"
                                      : "var(--md-on-surface)",
                                }}
                              >
                                {component === "penalty" ? `−${t.points}` : t.points}
                              </td>
                              <td className="px-4 py-2.5 align-top leading-snug text-[var(--md-on-surface-muted)]">
                                {t.note}
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-5 pb-5">
                    <NoticeLine>
                      This score has no stored term breakdown, so the arithmetic cannot be shown. The
                      composite and its five components above are what was recorded.
                    </NoticeLine>
                  </div>
                )}

                <div className="px-5 pb-5 text-[12.5px] text-[var(--md-on-surface-muted)]">
                  Scored {formatDate(score.scored_at)} by the deterministic engine, version score-v1. The
                  same inputs always produce the same number.
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Signals" sub={`${signals.length} on file`} />
            {signals.length === 0 ? (
              <EmptyState
                title="No signals"
                body="Nothing dated has been recorded for this account. Without a dated signal the timing component scores zero, which is why this account may rank lower than it deserves."
              />
            ) : (
              <ul className="flex flex-col gap-1 px-3 pb-3">
                {signals.map((s) => (
                  <li
                    key={s.id}
                    className="row-hover rounded-[var(--md-radius-md)] px-3 py-2.5"
                  >
                    <div className="text-[13.5px] leading-snug">{s.headline}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="readout text-[12.5px] text-[var(--md-on-surface-muted)]">
                        {formatDate(s.occurred_at)}
                      </span>
                      <span className="chip min-h-[24px] px-2.5 text-[11px]">
                        {s.kind.replace(/_/g, " ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="People you know" sub={`${people.length} first degree`} />
            {people.length === 0 ? (
              <EmptyState
                title="No warm contacts"
                body="Nobody from the connections list matched this account, so any approach here starts cold."
              />
            ) : (
              <ul className="flex flex-col gap-1 px-3 pb-3">
                {people.map((p) => {
                  const age = daysAgo(p.connected_on);
                  return (
                    <li
                      key={p.id}
                      className="row-hover rounded-[var(--md-radius-md)] px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium">{p.full_name}</span>
                        {p.is_decision_maker ? (
                          <Badge tone="good" withIcon>Decision maker</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[12.5px] leading-snug text-[var(--md-on-surface-muted)]">
                        {p.title ?? "Title unknown"}
                      </div>
                      {age != null ? (
                        <div className="readout mt-1 text-[12px] text-[var(--md-on-surface-muted)]">
                          Connected {formatDate(p.connected_on)}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Firmographics" />
            <dl className="flex flex-col gap-2.5 px-5 py-4 text-[13px]">
              {(
                [
                  ["Vertical", account.vertical],
                  ["Funding stage", account.funding_stage],
                  ["Last funding", formatDate(account.last_funding_date)],
                  ["Total raised", formatMoney(account.total_funding_usd as number | null)],
                  ["Open roles", account.open_roles_count || null],
                  ["Defense verdict", account.defense_verdict as string | null],
                ] as const
              ).map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[var(--md-on-surface-muted)]">{label}</dt>
                  <dd className="min-w-0 text-right">
                    {value != null && value !== "" ? (
                      <span className="readout text-[13px]">{String(value)}</span>
                    ) : (
                      <Blank />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
