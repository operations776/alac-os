import Link from "next/link";
import { Lock, Search } from "lucide-react";
import { getOrgId, searchAccounts, type Tier } from "@/lib/server/queries/portfolio";
import { Card, Badge, Eyebrow, EmptyState, ScoreDot, formatDate } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const TIERS: { value: string; label: string }[] = [
  { value: "", label: "All tiers" },
  { value: "top25", label: "Top 25" },
  { value: "next25", label: "Next 25" },
  { value: "watch", label: "Watch" },
  { value: "unassigned", label: "Unranked" },
];

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; page?: string }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return <div className="p-8"><EmptyState title="No data yet" body="Run the importers first." /></div>;
  }

  const q = params.q ?? "";
  const tier = (params.tier || undefined) as Tier | undefined;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // Server side paging: the table never ships 8,000 rows to the browser.
  const { rows, total, perPage } = await searchAccounts(orgId, { q, tier, page, perPage: 50 });
  const pages = Math.ceil(total / perPage);

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
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <header className="mb-5">
        <Eyebrow>All accounts</Eyebrow>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          {total.toLocaleString()} accounts
        </h1>
      </header>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]">
            <Search size={15} strokeWidth={1.5} />
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company or domain"
            aria-label="Search accounts"
            className="w-[280px] rounded-[6px] border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-[13.5px] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--brand)]"
          />
        </div>
        <select
          name="tier"
          defaultValue={tier ?? ""}
          aria-label="Filter by tier"
          className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[13.5px] outline-none focus:border-[var(--brand)]"
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-[6px] px-3 py-1.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          Apply
        </button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No matches" body="Try a different search term or clear the tier filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Score", "Company", "Tier", "Open roles", "Warm", "Last funding", "Location"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] ${
                        i === 0 || i === 3 || i === 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="tabular px-4 py-2.5 text-right">
                      <ScoreDot score={a.latest_score} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold hover:text-[var(--brand)] hover:underline"
                      >
                        {a.company_name}
                        {a.tier_locked ? <Lock size={12} strokeWidth={1.5} className="text-[var(--brand)]" /> : null}
                      </Link>
                      {a.domain ? (
                        <div className="text-[11.5px] text-[var(--ink-3)]">{a.domain}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
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
                    <td className="tabular px-4 py-2.5 text-right text-[13px]">
                      {a.open_roles_count || <span className="text-[var(--ink-3)]">—</span>}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[13px]">
                      {a.warm_contact_count || <span className="text-[var(--ink-3)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">
                      {formatDate(a.last_funding_date) ?? <span className="text-[var(--ink-3)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">
                      {a.hq_location ?? <span className="text-[var(--ink-3)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-[var(--ink-3)]">
            Page {page} of {pages.toLocaleString()}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={href({ page: page - 1 })}
                className="rounded-[6px] border border-[var(--line)] px-3 py-1.5 font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={href({ page: page + 1 })}
                className="rounded-[6px] border border-[var(--line)] px-3 py-1.5 font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"
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
