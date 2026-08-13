import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { getOrgId } from "@/lib/server/queries/portfolio";
import {
  pendingRecommendations,
  reviewCounts,
} from "@/lib/server/queries/recommendations";
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, formatDate,
} from "@/components/ui/primitives";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<string, string> = {
  top25: "Top 25",
  next25: "Next 25",
  watch: "Watch",
  unassigned: "Untiered",
  removed: "Removed",
};

export default async function ReviewPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org before reviewing." />
        </Card>
      </div>
    );
  }

  const [queue, counts] = await Promise.all([
    pendingRecommendations(orgId),
    reviewCounts(orgId),
  ]);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Friday review"
        title={
          counts.pending === 0
            ? "Nothing to decide"
            : `${counts.pending} ${counts.pending === 1 ? "decision" : "decisions"} waiting`
        }
        lede="The engine proposes, you decide. Approving a tier change moves the account immediately. Rejecting records why, which is what teaches the engine your judgement rather than repeating the same call next week."
      />

      {counts.approved_30d + counts.rejected_30d > 0 ? (
        <p className="readout -mt-3 mb-5 text-[12px] text-[var(--ink-3)]">
          Last 30 days: {counts.approved_30d} approved, {counts.rejected_30d} rejected.
          {counts.expired > 0 ? ` ${counts.expired} expired unreviewed.` : ""}
        </p>
      ) : null}

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            title="The queue is clear"
            body="Every proposal has been resolved. New ones appear after the next scoring run finds an account whose rank has moved far enough past a tier boundary to be worth your attention."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {queue.map((r) => (
            <Card key={r.id}>
              <CardHeader
                title={r.headline}
                sub={`Proposed ${formatDate(r.created_at)}, expires ${formatDate(r.expires_at)}`}
                right={
                  <div className="flex items-center gap-2">
                    <Badge tone={r.kind === "promote_tier" ? "good" : "warn"}>
                      {TIER_LABEL[r.from_tier ?? "unassigned"] ?? r.from_tier}
                    </Badge>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 text-[var(--ink-3)]"
                      aria-label="changes to"
                    />
                    <Badge tone={r.kind === "promote_tier" ? "good" : "neutral"}>
                      {TIER_LABEL[r.to_tier ?? "unassigned"] ?? r.to_tier}
                    </Badge>
                  </div>
                }
              />

              <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_292px]">
                <div className="flex flex-col gap-3.5 px-5 py-4">
                  <p className="prose-measure text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                    {r.rationale}
                  </p>

                  {r.why_now ? (
                    <div className="border-t border-[var(--line)] pt-3.5">
                      <div className="placard mb-1.5 text-[10px] text-[var(--ink-3)]">
                        Why this account matters
                      </div>
                      <p className="prose-measure text-[13.5px] leading-[1.6]">{r.why_now}</p>
                    </div>
                  ) : null}

                  {r.risks ? (
                    <div className="border-t border-[var(--line)] pt-3.5">
                      <div className="placard mb-1.5 text-[10px] text-[var(--ink-3)]">Risks</div>
                      <p className="prose-measure text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                        {r.risks}
                      </p>
                    </div>
                  ) : null}

                  <DecisionForm id={r.id} company={r.company_name} />
                </div>

                {/* The facts that justify the move, so the decision does not
                    require opening another page. */}
                <aside className="well border-t border-[var(--line)] px-5 py-4 md:border-l md:border-t-0">
                  <Link
                    href={`/accounts/${r.account_id}`}
                    className="rounded-[6px] text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                  >
                    {r.company_name}
                  </Link>
                  <dl className="mt-3 flex flex-col gap-2 text-[12.5px]">
                    <Row label="Score" value={r.score === null ? "not scored" : `${r.score} / 100`} />
                    <Row label="Open roles" value={r.open_roles_count ?? "unknown"} />
                    <Row label="Warm contacts" value={r.warm_contact_count ?? 0} />
                    <Row label="Defense" value={r.defense_verdict ?? "unverified"} />
                    <Row label="Location" value={r.hq_location ?? "unknown"} />
                  </dl>
                  {r.next_best_action ? (
                    <div className="mt-3.5 border-t border-[var(--line)] pt-3">
                      <div className="placard mb-1.5 flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                        <Lock size={16} strokeWidth={1.5} />
                        If you approve
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                        {r.next_best_action}
                      </p>
                    </div>
                  ) : null}
                </aside>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--ink-3)]">{label}</dt>
      <dd className="readout min-w-0 text-right text-[12px] font-medium">{value}</dd>
    </div>
  );
}
