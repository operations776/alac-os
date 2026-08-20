import Link from "next/link";
import { getOrgId, marketMap, marketCounts, type BandRow } from "@/lib/server/queries/desk";
import { Card, EmptyState, NoticeLine, PageHeader, Stat } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

// Who to target, in the order to work them.
//
// The whole market ranked into three bands, with the reason attached to every
// row. A list that told the operator WHICH companies but not WHY would just be
// the spreadsheet again, so the reason travels with the row and is written in
// plain words rather than in score components.

const BANDS = [
  {
    key: "now",
    label: "Work now",
    blurb: "The 25 to contact this week",
  },
  {
    key: "next",
    label: "Up next",
    blurb: "The bench behind them",
  },
  {
    key: "backlog",
    label: "Backlog",
    blurb: "On the list, nothing new. The next signal promotes from here",
  },
] as const;

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; page?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org first." />
        </Card>
      </div>
    );
  }

  const band = BANDS.some((b) => b.key === params.band) ? params.band! : "now";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const perPage = band === "backlog" ? 50 : 25;

  const [rows, counts] = await Promise.all([
    marketMap(orgId, band, perPage, (page - 1) * perPage),
    marketCounts(orgId),
  ]);

  const active = BANDS.find((b) => b.key === band)!;
  const total = counts[band as "now" | "next" | "backlog"] ?? 0;
  const pages = Math.ceil(total / perPage);

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Who to target"
        title="The whole market, in order"
        lede="Every company ranked by how well they fit, what just changed, and who you already know there. The reason is on every row."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Work now" value={counts.now ?? 0} hint="this week" />
        <Stat label="Up next" value={counts.next ?? 0} />
        <Stat label="Backlog" value={counts.backlog ?? 0} />
        <Stat
          label="Websites known"
          value={`${counts.with_domain ?? 0} of ${counts.mapped ?? 0}`}
          hint="needed to find people"
          tone={(counts.with_domain ?? 0) < (counts.mapped ?? 0) ? "warn" : undefined}
        />
      </div>

      {(counts.with_domain ?? 0) < (counts.mapped ?? 0) ? (
        <div className="mb-5">
          <NoticeLine>
            {(counts.mapped ?? 0) - (counts.with_domain ?? 0)} companies have no website on file yet.
            Finding people at a company needs its real website, so those rows show the ranking but no
            contacts until it is resolved.
          </NoticeLine>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {BANDS.map((b) => (
          <Link
            key={b.key}
            href={b.key === "now" ? "/targets" : `/targets?band=${b.key}`}
            aria-current={b.key === band ? "true" : undefined}
            className={`chip transition-colors ${
              b.key === band
                ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]"
                : "hover:bg-[var(--alac-surface-2)]"
            }`}
          >
            {b.label} {counts[b.key] ?? 0}
          </Link>
        ))}
        <span className="ml-auto text-[12.5px] text-[var(--alac-text-3)]">{active.blurb}</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing ranked yet"
            body="The market has not been mapped. Run the ranking to sort every company into work now, up next and backlog."
          />
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <AccountCard row={r} rank={(page - 1) * perPage + i + 1} />
            </li>
          ))}
        </ol>
      )}

      {pages > 1 ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="readout text-[13px] text-[var(--alac-text-3)]">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/targets?band=${band}&page=${page - 1}`}
                className="btn btn-secondary"
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={`/targets?band=${band}&page=${page + 1}`}
                className="btn btn-secondary"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One company, as a decision.
 *
 * Rank, name, why it is here, what they are hiring for, and who to call. If a
 * row cannot answer "why is this on my list", it should not be on the list.
 */
function AccountCard({ row, rank }: { row: BandRow; rank: number }) {
  return (
    <Card interactive className="px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="readout w-7 shrink-0 text-right text-[15px] text-[var(--alac-text-3)]">
          {rank}
        </span>
        <Link
          href={`/queue/${row.id}`}
          className="link display min-w-0 flex-1 text-[17px] font-medium"
        >
          {row.company_name}
        </Link>

        <span className="flex shrink-0 items-center gap-2">
          {row.heat_score != null ? (
            <span
              className="chip bg-[var(--alac-accent-soft)] text-[var(--alac-accent)]"
              title="How urgent, based on what just changed"
            >
              Urgency {row.heat_score}
            </span>
          ) : null}
          <span className="chip" title="How well they fit, from the master list">
            Fit {row.final_score != null ? Math.round(Number(row.final_score)) : "--"}
          </span>
        </span>
      </div>

      {row.work_reason ? (
        <p className="mt-2 pl-11 text-[13.5px] leading-relaxed text-[var(--alac-text-2)]">
          {row.work_reason}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-11 text-[12.5px]">
        <Fact
          label="Open roles"
          value={row.qualified_roles > 0 ? `${row.qualified_roles} relevant` : "none found"}
          dim={row.qualified_roles === 0}
        />
        <Fact
          label="You know"
          value={
            row.decision_makers > 0
              ? `${row.decision_makers} decision ${row.decision_makers === 1 ? "maker" : "makers"}`
              : row.warm_contacts > 0
                ? `${row.warm_contacts} ${row.warm_contacts === 1 ? "person" : "people"}`
                : "nobody yet"
          }
          dim={row.warm_contacts === 0}
        />
        <Fact
          label="Contact"
          value={
            row.top_contact
              ? `${row.top_contact}${row.top_contact_title ? `, ${row.top_contact_title}` : ""}`
              : row.domain
                ? "not sourced yet"
                : "needs a website first"
          }
          dim={!row.top_contact}
        />
      </div>
    </Card>
  );
}

function Fact({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[var(--alac-text-3)]">{label}:</span>
      <span
        className={dim ? "text-[var(--alac-text-3)]" : "text-[var(--alac-text-2)]"}
        title={value}
      >
        {value.length > 46 ? `${value.slice(0, 46)}...` : value}
      </span>
    </span>
  );
}
