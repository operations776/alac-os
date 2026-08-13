import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ExternalLink } from "lucide-react";
import {
  getOrgId, accountById, signalsForAccount, peopleForAccount, latestScoreForAccount,
  type BreakdownTerm,
} from "@/lib/server/queries/portfolio";
import {
  Card, CardHeader, Badge, Eyebrow, EmptyState, formatDate, formatMoney, daysAgo,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const COMPONENT_LABELS: Record<string, string> = {
  icp_fit: "ICP fit",
  hiring: "Hiring signal",
  timing: "Timing",
  relationship: "Relationship",
  revenue: "Revenue potential",
  penalty: "Penalty",
};

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
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <Link
        href="/portfolio"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-2)] hover:text-[var(--brand)]"
      >
        <ArrowLeft size={15} strokeWidth={1.5} /> Portfolio
      </Link>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Eyebrow>{account.vertical ?? "Account"}</Eyebrow>
          <h1 className="mt-1 flex items-center gap-2 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
            {account.company_name}
            {account.tier_locked ? (
              <span title="Pinned by a human, the engine may not demote it" className="text-[var(--brand)]">
                <Lock size={16} strokeWidth={1.5} />
              </span>
            ) : null}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--ink-3)]">
            {account.domain ? (
              <a
                href={`https://${account.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--brand)]"
              >
                {account.domain} <ExternalLink size={12} strokeWidth={1.5} />
              </a>
            ) : null}
            {account.hq_location ? <span>{account.hq_location}</span> : null}
            {account.employee_band ? <span>{account.employee_band} employees</span> : null}
            {account.founded_year ? <span>Founded {String(account.founded_year)}</span> : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Score</div>
          <div className="tabular text-[40px] font-extrabold leading-none tracking-[-0.03em]">
            {score?.score ?? "—"}
          </div>
          <div className="mt-1 flex justify-end gap-1.5">
            {account.is_suppressed ? <Badge tone="warn">Current client</Badge> : null}
            {account.tier === "top25" ? <Badge tone="brand">Top 25</Badge> : null}
            {account.tier === "next25" ? <Badge>Next 25</Badge> : null}
            {account.tier === "watch" ? <Badge>Watch</Badge> : null}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          {/* Why now leads the page. It is the question the product exists to
              answer, so it gets the largest text and its evidence sits under it. */}
          <Card>
            <CardHeader
              title="Why now"
              sub={score?.why_now ? undefined : "Reasoning pass has not run for this account yet"}
            />
            <div className="px-5 py-4">
              {score?.why_now ? (
                <p className="prose-measure text-[16px] leading-[1.55]">{score.why_now}</p>
              ) : (
                <p className="prose-measure text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  No written reasoning yet. The deterministic score below is complete and auditable on its
                  own. The narrative layer is added by a separate pass that must cite the dated signals
                  listed here, and it is never generated without them.
                </p>
              )}

              {signals.length > 0 ? (
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Evidence on file
                  </div>
                  <ul className="flex flex-col gap-2">
                    {signals.slice(0, 5).map((s) => (
                      <li key={s.id} className="flex items-baseline gap-2.5 text-[13px]">
                        <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                        <span className="flex-1">{s.headline}</span>
                        <span className="shrink-0 text-[11.5px] text-[var(--ink-3)]">
                          {formatDate(s.occurred_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] text-[var(--ink-3)]">
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
                  <div>
                    <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      Next best action
                    </div>
                    <p className="prose-measure text-[14px] leading-[1.55]">{score.next_best_action}</p>
                  </div>
                ) : null}
                {score.risks ? (
                  <div>
                    <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      Risks
                    </div>
                    <p className="prose-measure text-[14px] leading-[1.55] text-[var(--ink-2)]">
                      {score.risks}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* The arithmetic. This is what turns a number into a decision. */}
          <Card>
            <CardHeader title="How this score was calculated" sub="Five components, then penalties" />
            {!score ? (
              <EmptyState title="Not scored yet" body="Run the scoring pass to populate this." />
            ) : (
              <>
                <div className="flex flex-col gap-2.5 border-b border-[var(--line)] px-5 py-4">
                  {components.map((c) => (
                    <div key={c.key}>
                      <div className="mb-1 flex items-baseline justify-between text-[13px]">
                        <span>{COMPONENT_LABELS[c.key]}</span>
                        <span className="tabular font-semibold">
                          {c.value}
                          <span className="font-normal text-[var(--ink-3)]"> / {c.max}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(c.value / c.max) * 100}%`, background: "var(--brand)" }}
                        />
                      </div>
                    </div>
                  ))}
                  {score.penalty > 0 ? (
                    <div className="flex items-baseline justify-between pt-1 text-[13px]">
                      <span className="text-[var(--bad)]">Penalties</span>
                      <span className="tabular font-semibold text-[var(--bad)]">-{score.penalty}</span>
                    </div>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[var(--line)]">
                        {["Component", "Term", "Read", "Points", "Why"].map((h, i) => (
                          <th
                            key={h}
                            className={`px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] ${
                              i === 3 ? "text-right" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byComponent).map(([component, list]) =>
                        list.map((t, i) => (
                          <tr key={`${component}-${t.term}`} className="border-b border-[var(--line)] last:border-0">
                            <td className="px-4 py-2 text-[var(--ink-3)]">
                              {i === 0 ? COMPONENT_LABELS[component] ?? component : ""}
                            </td>
                            <td className="px-4 py-2">{t.term}</td>
                            <td className="px-4 py-2 text-[var(--ink-2)]">{String(t.input)}</td>
                            <td
                              className={`tabular px-4 py-2 text-right font-semibold ${
                                component === "penalty" ? "text-[var(--bad)]" : ""
                              }`}
                            >
                              {component === "penalty" ? `-${t.points}` : t.points}
                            </td>
                            <td className="px-4 py-2 text-[var(--ink-3)]">{t.note}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-[var(--line)] px-5 py-3 text-[11.5px] text-[var(--ink-3)]">
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
              <EmptyState title="No signals" body="Nothing dated has been recorded for this account." />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {signals.map((s) => (
                  <li key={s.id} className="px-5 py-2.5">
                    <div className="text-[13px]">{s.headline}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--ink-3)]">
                      <span>{formatDate(s.occurred_at)}</span>
                      <span>·</span>
                      <span>{s.kind.replace(/_/g, " ")}</span>
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
                body="Nobody from the connections list matched this account."
              />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {people.map((p) => {
                  const age = daysAgo(p.connected_on);
                  return (
                    <li key={p.id} className="px-5 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold">{p.full_name}</span>
                        {p.is_decision_maker ? <Badge tone="good">Decision maker</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[var(--ink-3)]">{p.title ?? "Title unknown"}</div>
                      {age != null ? (
                        <div className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">
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
            <dl className="flex flex-col gap-2 px-5 py-4 text-[13px]">
              {[
                ["Vertical", account.vertical],
                ["Funding stage", account.funding_stage],
                ["Last funding", formatDate(account.last_funding_date)],
                ["Total raised", formatMoney(account.total_funding_usd as number | null)],
                ["Open roles", account.open_roles_count || null],
                ["Defense verdict", account.defense_verdict as string | null],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--ink-3)]">{label}</dt>
                  <dd className="text-right font-medium">
                    {value != null && value !== "" ? String(value) : <span className="text-[var(--ink-3)]">—</span>}
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
