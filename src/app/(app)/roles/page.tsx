import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getOrgId, freshRoles, freshRoleCounts, roleFloor } from "@/lib/server/queries/desk";
import { DESK } from "@/config/desk.mjs";
import { Card, EmptyState, PageHeader, Stat, formatDate } from "@/components/ui/primitives";
import { Row } from "@/components/ui/clickable";
import { WhyRole } from "@/components/ui/explain";
import { Hint } from "@/components/ui/hint";
import { CheckRoles } from "@/components/ui/check-roles";
import { Dismiss, Restore } from "@/components/ui/dismiss";
import { PushToBoard } from "@/components/ui/push-board";
import { DISMISS_REASONS } from "@/config/dismiss-reasons.mjs";

export const dynamic = "force-dynamic";

// OPEN ROLES. His number one, in his words: the active requisitions, live
// today, this week or this month, graded by how hard the job is to fill and
// how long it has been on the market.
//
// The whole corpus is processed. The screen shows the top tenth by that
// grade, because five live leads a day come from the top of the list, not
// from four thousand rows. Everything else is one toggle away.

// The aged bands come first because that is the order he works in: a role
// open 90 days is a hiring manager who has failed to fill it twice, and a
// role posted this morning is a job posting. The recent windows stay, one
// click away, for the days he wants to see what is new.
const RANGES = [
  { key: "aged30", minAge: 30, label: "30+ days" },
  { key: "aged60", minAge: 60, label: "60+ days" },
  { key: "aged90", minAge: 90, label: "90+ days" },
  { key: "today", days: 1, label: "Today" },
  { key: "week", days: 7, label: "This week" },
  { key: "month", days: 30, label: "This month" },
] as const;

const DEFAULT_RANGE = "aged30";

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
  searchParams: Promise<{ range?: string; all?: string; q?: string; dismissed?: string }>;
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

  const range = RANGES.find((r) => r.key === params.range) ?? RANGES[0];
  const showAll = params.all === "1";
  const showDismissed = params.dismissed === "1";
  const q = (params.q ?? "").trim().toLowerCase();
  const floor = await roleFloor(orgId, DESK.ROLE_TOP_SHARE);

  const href = (r: string, all: boolean, dismissed = showDismissed) => {
    const p = new URLSearchParams();
    if (r !== DEFAULT_RANGE) p.set("range", r);
    if (all) p.set("all", "1");
    if (dismissed) p.set("dismissed", "1");
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/roles?${s}` : "/roles";
  };

  const aged = "minAge" in range;
  // A role posted this week cannot have aged, so the short windows gate on
  // how hard it is to fill and rank by the score; the month gates on the
  // score itself, where time open has had time to count. An aged role has
  // already proven itself hard by sitting unfilled, so it sorts by age and
  // clears a lower difficulty bar.
  const fresh = !aged && range.key !== "month";
  const [allRoles, counts] = await Promise.all([
    freshRoles(orgId, {
      // The dismissed view ignores every bar: he took these off deliberately
      // and has to be able to find all of them again.
      days: showDismissed ? 365 : aged ? undefined : (range as { days: number }).days,
      minAge: showDismissed || !aged ? undefined : (range as { minAge: number }).minAge,
      limit: showAll || showDismissed ? 400 : 120,
      // By score, not by age, even here. The band already guarantees every
      // role in it is old, so the useful question inside the band is which
      // of these old roles is hardest to fill.
      sort: "relevant",
      floor: showAll || showDismissed || fresh || aged ? 0 : floor,
      minDifficulty: showAll || showDismissed
        ? 0
        : aged ? DESK.AGED_MIN_DIFFICULTY : fresh ? DESK.LEAD_MIN_DIFFICULTY : 0,
      dismissedOnly: showDismissed,
    }),
    freshRoleCounts(orgId, floor, DESK.LEAD_MIN_DIFFICULTY, DESK.AGED_MIN_DIFFICULTY),
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
        lede={aged
          ? `Requisitions open ${(range as { minAge: number }).minAge} days or more, longest first. These are the ones the employer has failed to fill alone, which is when an agency call lands. Graded by how hard they are to fill times how long they have been open. Dead postings are removed on every pull.`
          : fresh
          ? `Live requisitions posted ${range.label.toLowerCase()} at the companies on your list, hardest to fill first. Only roles at difficulty ${DESK.LEAD_MIN_DIFFICULTY} or above: senior, cleared, or a scarce specialism. Dead postings are removed on every pull.`
          : `Live requisitions from the last month, graded by how hard they are to fill times how long they have been open. Showing the top tenth, score ${floor} and above.`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open 30+ days" value={counts.aged_30} hint="their own pipeline is not working" href={href("aged30", false)} />
        <Stat label="Open 60+ days" value={counts.aged_60} hint="two months without a hire" href={href("aged60", false)} />
        <Stat label="Open 90+ days" value={counts.aged_90} hint="the most acute pain on the board" href={href("aged90", false)} />
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
          {counts.dismissed > 0 || showDismissed ? (
            <Link
              href={href(range.key, showAll, !showDismissed)}
              className={`chip transition-colors ${showDismissed ? "bg-[var(--alac-warn-soft)] text-[var(--alac-warn)]" : "hover:bg-[var(--alac-surface-2)]"}`}
              title={showDismissed ? "Back to the live list" : "The roles you took off the boards. Nothing is deleted"}
            >
              {showDismissed ? "Showing dismissed" : `${counts.dismissed} dismissed`}
            </Link>
          ) : null}
          <Link
            href={href(range.key, !showAll)}
            className={`chip transition-colors ${showAll ? "bg-[var(--alac-surface-2)] text-[var(--alac-text)]" : "hover:bg-[var(--alac-surface-2)]"}`}
            title={showAll ? "Back to the ones that clear the bar" : "Show every live role in this window, including the easy ones"}
          >
            {showAll ? "Showing everything" : "Show everything"}
          </Link>
        </span>
      </div>

      {roles.length === 0 ? (
        <Card>
          <EmptyState
            title={showDismissed ? "Nothing dismissed" : showAll ? "Nothing live in this window" : "Nothing cleared the bar in this window"}
            body={showAll ? "No live role at a company on your list was posted in this window." : "Widen the window, or show everything to see the easier roles too."}
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
                    <td className="readout px-4 py-2.5 align-top text-[12.5px]">
                      {typeof r.age_days === "number" ? (
                        <span
                          className={
                            r.age_days >= 90 ? "text-[var(--alac-red-text)]"
                            : r.age_days >= 30 ? "text-[var(--alac-warn)]"
                            : "text-[var(--alac-text-3)]"
                          }
                          title={`First seen ${formatDate(r.first_seen) ?? "unknown"}`}
                        >
                          {r.age_days === 0 ? "today" : `${r.age_days} days`}
                        </span>
                      ) : (
                        <span className="text-[var(--alac-text-3)]">{ago(r.first_seen)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                      {[r.location, r.salary_text].filter(Boolean).join(" · ") || <span className="text-[var(--alac-text-3)]">--</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="flex items-center gap-3">
                        <WhyRole role={r} label="Why" />
                        {showDismissed ? null : (
                          <PushToBoard accountId={r.account_id} roleId={r.id} />
                        )}
                        {showDismissed
                          ? <Restore kind="role" refId={r.id} />
                          : <Dismiss kind="role" refId={r.id} reasons={DISMISS_REASONS.role} />}
                      </span>
                    </td>
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--alac-text-3)]">
          Pulled {formatDate(counts.pulled_at) ?? "never"}. Postings are checked against the employer&apos;s own page
          every morning; one whose page has gone, or that the provider has not seen for {DESK.ROLE_STALE_DAYS} days,
          is closed and leaves every screen.
        </p>
        <CheckRoles />
      </div>
    </div>
  );
}
