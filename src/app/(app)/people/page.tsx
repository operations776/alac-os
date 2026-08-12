import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/portfolio";
import { Card, Badge, Eyebrow, EmptyState, formatDate } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type PersonRow = {
  id: string;
  full_name: string;
  title: string | null;
  company_text: string | null;
  linkedin_url: string | null;
  seniority: string | null;
  is_decision_maker: boolean;
  connected_on: string | null;
  account_id: string | null;
  account_name: string | null;
  open_roles_count: number | null;
};

export default async function PeoplePage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return <div className="p-8"><EmptyState title="No data yet" body="Run the importers first." /></div>;
  }

  // Matched contacts at hiring companies first: that is the actionable end of
  // the list, and an unmatched contact cannot be worked from here.
  const rows = (await sql`
    select p.id, p.full_name, p.title, p.company_text, p.linkedin_url,
           p.seniority, p.is_decision_maker, p.connected_on, p.account_id,
           a.company_name as account_name, a.open_roles_count
      from people p
      left join accounts a on a.id = p.account_id
     where p.org_id = ${orgId}
     order by (a.open_roles_count is not null and a.open_roles_count > 0) desc,
              a.latest_score desc nulls last,
              p.connected_on desc nulls last
     limit 100
  `) as PersonRow[];

  const stats = (await sql`
    select count(*)::int as total,
           count(*) filter (where account_id is not null)::int as matched,
           count(*) filter (where is_decision_maker)::int as decision_makers
      from people where org_id = ${orgId}
  `) as { total: number; matched: number; decision_makers: number }[];

  const s = stats[0];

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <header className="mb-5">
        <Eyebrow>Warm network</Eyebrow>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          {s.total.toLocaleString()} first degree contacts
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[14px] text-[var(--ink-2)]">
          {s.matched} are matched to a company in the portfolio and {s.decision_makers} hold a decision
          making title. These need no introduction, which is why they are the shortest path to a
          conversation.
        </p>
      </header>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Name", "Title", "Company", "Open roles", "Connected"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] ${
                      i === 3 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold">{p.full_name}</span>
                      {p.is_decision_maker ? <Badge tone="good">DM</Badge> : null}
                    </div>
                    {p.linkedin_url ? (
                      <a
                        href={p.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-3)] hover:text-[var(--brand)]"
                      >
                        LinkedIn <ExternalLink size={11} strokeWidth={1.5} />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-[var(--ink-2)]">{p.title ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[13px]">
                    {p.account_id ? (
                      <Link
                        href={`/accounts/${p.account_id}`}
                        className="font-medium hover:text-[var(--brand)] hover:underline"
                      >
                        {p.account_name}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-3)]">{p.company_text ?? "—"}</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-[13px]">
                    {p.open_roles_count ? p.open_roles_count : <span className="text-[var(--ink-3)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">
                    {formatDate(p.connected_on) ?? <span className="text-[var(--ink-3)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-[12px] text-[var(--ink-3)]">
        Showing the 100 most actionable of {s.total.toLocaleString()}.
      </p>
    </div>
  );
}
