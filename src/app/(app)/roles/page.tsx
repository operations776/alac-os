import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getOrgId, freshRoles, freshRoleCounts } from "@/lib/server/queries/desk";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// What went up recently, and what to call about.
//
// The one screen that is time sensitive by nature. A role posted this morning
// is a reason to contact somebody this morning: nobody else has called yet, and
// the hiring manager still has the requisition in front of them. The same role
// in three weeks is one of forty and no longer a reason for anything, so this
// is ordered by when it appeared and nothing else.

const RANGES = [
  { key: "today", days: 1, label: "Today" },
  { key: "week", days: 7, label: "This week" },
  { key: "month", days: 30, label: "This month" },
] as const;

function ago(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org first." />
        </Card>
      </div>
    );
  }

  const range = RANGES.find((r) => r.key === params.range) ?? RANGES[1];
  const [roles, counts] = await Promise.all([
    freshRoles(orgId, range.days, 80),
    freshRoleCounts(orgId),
  ]);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Open roles"
        title="What to call about"
        lede="Roles that went up recently at the companies you are working. Newest first, because a job posted this morning is a reason to call this morning."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Posted today" value={counts.today ?? 0} hint="nobody has called yet" />
        <Stat label="This week" value={counts.week ?? 0} />
        <Stat label="Companies hiring" value={counts.companies ?? 0} hint="this week" />
        <Stat label="Relevant roles open" value={counts.total ?? 0} hint="all companies" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={r.key === "week" ? "/roles" : `/roles?range=${r.key}`}
            aria-current={r.key === range.key ? "true" : undefined}
            className={`chip transition-colors ${
              r.key === range.key
                ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]"
                : "hover:bg-[var(--alac-surface-2)]"
            }`}
          >
            {r.label}
          </Link>
        ))}
        <span className="ml-auto text-[12.5px] text-[var(--alac-text-3)]">
          Every role links to the company&apos;s own careers page
        </span>
      </div>

      {roles.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing new in this window"
            body="No relevant roles have appeared at the companies you are working. Widen the window, or pull again."
          />
        </Card>
      ) : (
        <ol className="rise-list flex flex-col gap-3">
          {roles.map((r) => (
            <li key={r.id}>
              <Card interactive className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <Link
                    href={`/queue/${r.account_id}`}
                    className="link display text-[16px] font-medium"
                  >
                    {r.company_name}
                  </Link>
                  {r.work_band === "now" ? (
                    <span className="chip bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]">
                      Work now
                    </span>
                  ) : r.work_band === "next" ? (
                    <span className="chip">Up next</span>
                  ) : null}
                  <span className="readout ml-auto text-[12.5px] text-[var(--alac-text-3)]">
                    {ago(r.first_seen)}
                  </span>
                </div>

                <p className="mt-1.5 text-[15px] font-medium">{r.title}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--alac-text-3)]">
                  {r.location ? <span>{r.location}</span> : null}
                  {/* Only some employers publish a band. Where they do, a
                      candidate conversation can start without a discovery call
                      about money, which is worth showing. */}
                  {r.salary_text ? (
                    <span className="text-[var(--alac-text-2)]">{r.salary_text}</span>
                  ) : null}
                  <span>{r.open_at_company} relevant roles open here</span>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="link inline-flex items-center gap-1.5"
                    >
                      Open the posting <ExternalLink size={16} strokeWidth={1.5} />
                    </a>
                  ) : null}
                </div>

                {/* The reason to call, not just the role. A new opening plus the
                    round that paid for it is a conversation; the opening alone
                    is a job board. */}
                {r.why_now ? (
                  <p className="mt-2.5 border-t border-[var(--alac-line)] pt-2.5 text-[13px] leading-relaxed text-[var(--alac-text-2)]">
                    Why now: {r.why_now}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
