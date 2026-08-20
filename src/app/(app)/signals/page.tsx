import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getOrgId, signalHeat, heatCounts } from "@/lib/server/queries/desk";
import {
  Card, EmptyState, GaugeRow, NoticeLine, PageHeader, Stat, formatDate,
} from "@/components/ui/primitives";
import { HEAT_COMPONENTS, HeatDelta } from "@/components/ui/desk";

export const dynamic = "force-dynamic";

// SIGNAL HEAT. The second scoring system, and the one this app actually
// computes against.
//
// The TAM final score answers "is this account qualified", which is settled
// upstream and never changed here. Heat answers a different question: did
// something just happen that changes the timing. The two are shown together
// because the gap between them is the point, and the gap is what the desk acts
// on: a signal well above its account's TAM rank is a company to move on now.

export default async function SignalsPage() {
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

  const [signals, stats] = await Promise.all([signalHeat(orgId, 100), heatCounts(orgId)]);

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Signal heat"
        title="What just changed"
        lede="Every signal is scored out of 100 across six components, and shown against the account's standing TAM score. A signal above its TAM rank is a company whose timing moved ahead of its qualification."
      />

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Signals scored" value={stats.total} />
        <Stat label="Hotter than TAM" value={stats.hotter_than_tam} hint="timing ahead of rank" />
        <Stat label="Top heat" value={stats.top_heat ?? "--"} />
        <Stat
          label="Not in TAM yet"
          value={stats.unlinked}
          hint="signal without an account"
          tone={stats.unlinked > 0 ? "warn" : undefined}
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
              <li key={s.id}>
                <Card>
                  <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="readout text-[13px] text-[var(--md-on-surface-muted)]">
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
                          <span className="display text-[18px]">{s.company_name}</span>
                        )}
                        <span className="readout text-[13px] text-[var(--md-on-surface-muted)]">
                          {formatDate(s.signal_date)}
                        </span>
                        {s.hq ? (
                          <span className="text-[12.5px] text-[var(--md-on-surface-muted)]">
                            {s.hq}
                          </span>
                        ) : null}
                      </div>

                      <p className="prose-measure mt-2.5 text-[14px] leading-[1.6]">
                        {s.what_happened}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {s.the_number ? (
                          <span className="chip bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]">
                            {s.the_number}
                          </span>
                        ) : null}
                        {s.recommended_move ? (
                          <span className="chip">{s.recommended_move}</span>
                        ) : null}
                      </div>

                      {s.best_contact ? (
                        <p className="mt-3 text-[13px] text-[var(--md-on-surface-variant)]">
                          <span className="text-[var(--md-on-surface-muted)]">Best contact: </span>
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
                            <span className="text-[12.5px] text-[var(--md-on-surface-muted)]">
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
                        <span className="placard text-[12px] text-[var(--md-on-surface-variant)]">
                          Heat score
                        </span>
                        <span className="readout text-[26px] leading-none text-[var(--md-primary)]">
                          {s.heat_score ?? "--"}
                          <span className="text-[13px] text-[var(--md-on-surface-muted)]"> / 100</span>
                        </span>
                      </div>

                      <div className="mt-3.5 flex flex-col gap-2.5">
                        {parts.map((p) => (
                          <GaugeRow key={p.key} label={p.label} value={p.value} max={p.max} />
                        ))}
                      </div>

                      <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-[var(--md-outline-variant)] pt-3">
                        <span className="text-[13px] text-[var(--md-on-surface-variant)]">
                          Against TAM {s.tam_final_score ? Math.round(Number(s.tam_final_score)) : "--"}
                        </span>
                        <HeatDelta delta={s.heat_vs_tam} />
                      </div>

                      {disagrees ? (
                        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--md-warning)]">
                          The components add to {sum} and the stored heat score is {s.heat_score}. Both
                          are shown exactly as recorded. A gap means the row was scored by a different
                          model version than the components describe.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
