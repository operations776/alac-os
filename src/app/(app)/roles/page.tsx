import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getOrgId, freshRoles, freshRoleCounts, roleFloor } from "@/lib/server/queries/desk";
import { DESK } from "@/config/desk.mjs";
import { Card, EmptyState, PageHeader, Stat, formatDate } from "@/components/ui/primitives";
import { Row } from "@/components/ui/clickable";
import { WhyRole } from "@/components/ui/explain";
import { Hint } from "@/components/ui/hint";

export const dynamic = "force-dynamic";

// OPEN ROLES. His number one, in his words: the active requisitions, live
// today, this week or this month, graded by how hard the job is to fill and
// how long it has been on the market.
//
// The whole corpus is processed. The screen shows the top tenth by that
// grade, because five live leads a day come from the top of the list, not
// from four thousand rows. Everything else is one toggle away.

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
  searchParams: Promise<{ range?: string; all?: string; q?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card><EmptyState title="No organization" body="Seed an org first." /></Card>
      </div>
    );
  }

  const range = RANGES.find((r) => r.key === params.range) ?? RANGES[1];
  const showAll = params.all === "1";
  const q = (params.q ?? "").trim().toLowerCase();
  const floor = await roleFloor(orgId, DESK.ROLE_TOP_SHARE);

  const href = (r: string, all: boolean) => {
    const p = new URLSearchParams();
    if (r !== "week") p.set("range", r);
    if (all) p.set("all", "1");
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/roles?${s}` : "/roles";
  };

  const [allRoles, counts] = await Promise.all([
    freshRoles(orgId, range.days, showAll ? 400 : 120, "relevant", showAll ? 0 : floor),
    freshRoleCounts(orgId, floor),
  ]);
  // The market bars pass a city or a discipline word; it narrows in memory
  // because the list is already small.
  const roles = q
    ? allRoles.filter((r) => `${r.title} ${r.location ?? ""} ${r.occupation ?? ""}`.toLowerCase().includes(q))
    : allRoles;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Open roles"
        title="What to call about"
        lede={`Live requisitions at the companies on your list, graded by how hard they are to fill and how long they have been open. Showing the top tenth, score ${floor} and above. Dead postings are removed on every pull.`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Top roles today" value={counts.today} hint="posted since yesterday" href={href("today", false)} />
        <Stat label="This week" value={counts.week} href={href("week", false)} />
        <Stat label="This month" value={counts.month} href={href("month", false)} />
        <Stat
          label="Processed"
          value={counts.total.toLocaleString()}
          hint={`${counts.top} clear the bar. ${counts.closed} closed postings removed`}
          href={href(range.key, true)}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={href(r.key, showAll)}
            aria-current={r.key === range.key ? "true" : undefined}
            className={`chip transition-colors ${
              r.key === range.key ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]" : "hover:bg-[var(--alac-surface-2)]"
            }`}
          >
            {r.label}
          </Link>
        ))}
        {q ? (
          <span className="chip">
            {q} <Link href={href(range.key, showAll)} className="ml-1 link">clear</Link>
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <Link
            href={href(range.key, !showAll)}
            className={`chip transition-colors ${showAll ? "bg-[var(--alac-surface-2)] text-[var(--alac-text)]" : "hover:bg-[var(--alac-surface-2)]"}`}
            title={showAll ? "Back to the top tenth" : "Show every live role in this window, not just the top tenth"}
          >
            {showAll ? "Showing everything" : "Show everything"}
          </Link>
        </span>
      </div>

      {roles.length === 0 ? (
        <Card>
          <EmptyState
            title={showAll ? "Nothing live in this window" : "Nothing cleared the bar in this window"}
            body={showAll ? "No live role at a company on your list was posted in this window." : "Widen the window, or show everything to see roles below the top tenth."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-[var(--alac-ground)]">
                  <th className="px-4 py-2 text-right"><Hint label="Score" text="Commercial score out of 100: how hard to fill, times how long open, plus discipline fit and published salary. Why opens the arithmetic." /></th>
                  <th className="px-4 py-2 text-left"><Hint label="Company" text="Only companies on your list. Not in your ICP? Open the company and mark it Disqualified; its roles leave every screen." /></th>
                  <th className="px-4 py-2 text-left"><Hint label="Role" text="The title as the employer posted it. Opens the live posting." /></th>
                  <th className="px-4 py-2 text-left"><Hint label="Open" text="Days since the posting first appeared. Longer open means their own pipeline has failed." /></th>
                  <th className="px-4 py-2 text-left"><Hint label="Where" text="Location and published salary where the employer gives one." /></th>
                  <th className="px-4 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <Row key={r.id} href={`/queue/${r.account_id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
                    <td className="readout px-4 py-2.5 text-right align-top text-[15px] text-[var(--alac-accent)]">{r.relevance ?? "--"}</td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="text-[13.5px] font-medium">{r.company_name}</span>
                      {r.open_at_company > 1 ? (
                        <div className="text-[11.5px] text-[var(--alac-text-3)]">{r.open_at_company} live here</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[13.5px]">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
                          {r.title} <ExternalLink size={16} strokeWidth={1.5} />
                        </a>
                      ) : r.title}
                    </td>
                    <td className="readout px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-3)]">{ago(r.first_seen)}</td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                      {[r.location, r.salary_text].filter(Boolean).join(" · ") || <span className="text-[var(--alac-text-3)]">--</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top"><WhyRole role={r} label="Why" /></td>
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 text-[12px] text-[var(--alac-text-3)]">
        Pulled {formatDate(counts.pulled_at) ?? "never"}. A posting the provider has not seen for {DESK.ROLE_STALE_DAYS} days, or whose page has gone, is closed and removed from every screen.
      </p>
    </div>
  );
}
