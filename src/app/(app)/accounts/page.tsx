import Link from "next/link";
import { Lock, Search } from "lucide-react";
import { getOrgId, searchAccounts, type Tier } from "@/lib/server/queries/portfolio";
import {
  Badge, Blank, Card, EmptyState, PageHeader, ScoreDot, Th, formatDate,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const TIERS: { value: string; label: string }[] = [
  { value: "", label: "All tiers" },
  { value: "top25", label: "Top 25" },
  { value: "next25", label: "Next 25" },
  { value: "watch", label: "Watch" },
  { value: "unassigned", label: "Unranked" },
];

const CONTROL =
  "rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--brand)]";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; page?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No data yet" body="Run the importers first." />
        </Card>
      </div>
    );
  }

  const q = params.q ?? "";
  const tier = (params.tier || undefined) as Tier | undefined;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // Server side paging: the table never ships 8,000 rows to the browser.
  const { rows, total, perPage } = await searchAccounts(orgId, { q, tier, page, perPage: 50 });
  const pages = Math.ceil(total / perPage);
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  const href = (next: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, tier, page, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && !(k === "page" && v === 1)) sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? `/accounts?${s}` : "/accounts";
  };

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="All accounts"
        title={`${total.toLocaleString()} accounts`}
        lede={
          q || tier
            ? "Filtered view. Clear the search and the tier filter to see the whole universe."
            : "The complete account universe, ranked by score. Search by company or domain, or narrow to a tier."
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
            aria-hidden="true"
          >
            <Search size={16} strokeWidth={1.5} />
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company or domain"
            aria-label="Search accounts"
            className={`${CONTROL} w-full pl-9 sm:w-[300px]`}
          />
        </div>
        <select
          name="tier"
          defaultValue={tier ?? ""}
          aria-label="Filter by tier"
          className={CONTROL}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-[6px] border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3.5 py-2 text-[13px] font-semibold text-[var(--brand)] transition-colors hover:border-[var(--brand)]"
        >
          Apply
        </button>
        {q || tier ? (
          <Link
            href="/accounts"
            className="rounded-[6px] px-2 py-2 text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No matches"
            body="No account matched this search. Try a different term or clear the tier filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                  <Th align="right">Score</Th>
                  <Th>Company</Th>
                  <Th>Tier</Th>
                  <Th align="right">Open roles</Th>
                  <Th align="right">Warm</Th>
                  <Th>Last funding</Th>
                  <Th>Location</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--line)] last:border-0 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 text-right align-top">
                      <ScoreDot score={a.latest_score} />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="inline-flex items-center gap-1.5 rounded-[6px] text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                      >
                        {a.company_name}
                        {a.tier_locked ? (
                          <>
                            <Lock size={16} strokeWidth={1.5} className="text-[var(--brand)]" />
                            <span className="sr-only">Pinned</span>
                          </>
                        ) : null}
                      </Link>
                      {a.domain ? (
                        <div className="readout mt-0.5 text-[11px] text-[var(--ink-3)]">{a.domain}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {a.is_suppressed ? (
                        <Badge tone="warn">Client</Badge>
                      ) : a.tier === "top25" ? (
                        <Badge tone="brand">Top 25</Badge>
                      ) : a.tier === "next25" ? (
                        <Badge>Next 25</Badge>
                      ) : a.tier === "watch" ? (
                        <Badge>Watch</Badge>
                      ) : (
                        <span className="text-[12px] text-[var(--ink-3)]">Unranked</span>
                      )}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[13px]">
                      {a.open_roles_count || <Blank />}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[13px]">
                      {a.warm_contact_count || <Blank />}
                    </td>
                    <td className="readout px-4 py-2.5 align-top text-[12px] text-[var(--ink-2)]">
                      {formatDate(a.last_funding_date) ?? <Blank />}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--ink-2)]">
                      {a.hq_location ?? <Blank />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className="readout text-[12px] text-[var(--ink-3)]">
            {first.toLocaleString()}&ndash;{last.toLocaleString()} of {total.toLocaleString()}
            {pages > 1 ? `, page ${page} of ${pages.toLocaleString()}` : ""}
          </span>
          {pages > 1 ? (
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={href({ page: page - 1 })}
                  className="rounded-[6px] border border-[var(--line-strong)] px-3 py-1.5 font-semibold transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link
                  href={href({ page: page + 1 })}
                  className="rounded-[6px] border border-[var(--line-strong)] px-3 py-1.5 font-semibold transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  Next
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
