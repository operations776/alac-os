import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import {
  Badge, Blank, Card, EmptyState, PageHeader, Th, formatDate,
} from "@/components/ui/primitives";

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
  final_score: string | null;
  priority: string | null;
};

export default async function PeoplePage() {
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

  // Matched contacts at the highest ranked companies first: that is the
  // actionable end of the list, and an unmatched contact cannot be worked from
  // here. Ordering follows the queue's own rule, priority then final score.
  const rows = (await sql`
    select p.id, p.full_name, p.title, p.company_text, p.linkedin_url,
           p.seniority, p.is_decision_maker, p.connected_on, p.account_id,
           a.company_name as account_name, a.final_score, a.priority::text as priority
      from people p
      left join tam_accounts a on a.id = p.account_id
     where p.org_id = ${orgId}
     order by (p.account_id is not null) desc,
              a.priority nulls last,
              a.final_score desc nulls last,
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
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Warm network"
        title={`${s.total.toLocaleString()} first degree contacts`}
        lede={
          <>
            {s.matched} are matched to a company in the account queue and {s.decision_makers} hold a
            decision making title. These need no introduction, which is why they are the shortest path
            to a conversation.
          </>
        }
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No contacts loaded"
            body="The connections list has not been imported for this organization, so there is no warm network to work from."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-[var(--alac-ground)]">
                  <Th>Name</Th>
                  <Th>Title</Th>
                  <Th>Company</Th>
                  <Th align="right">TAM score</Th>
                  <Th>Connected</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className="row-hover border-b border-[var(--alac-line)] last:border-0"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">{p.full_name}</span>
                        {p.is_decision_maker ? (
                          <Badge tone="good">Decision maker</Badge>
                        ) : null}
                      </div>
                      {p.linkedin_url ? (
                        <a
                          href={p.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="link mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--alac-text-3)]"
                        >
                          LinkedIn <ExternalLink size={16} strokeWidth={1.5} />
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[13.5px] text-[var(--alac-text-2)]">
                      {p.title ?? <Blank label="title unknown" />}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[13.5px]">
                      {p.account_id ? (
                        <Link href={`/queue/${p.account_id}`} className="link font-medium">
                          {p.account_name}
                        </Link>
                      ) : p.company_text ? (
                        <span
                          className="text-[var(--alac-text-3)]"
                          title="Not matched to a company in the account queue"
                        >
                          {p.company_text}
                        </span>
                      ) : (
                        <Blank label="no company recorded" />
                      )}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[13.5px]">
                      {p.final_score != null ? Math.round(Number(p.final_score)) : <Blank />}
                    </td>
                    <td className="readout px-4 py-2.5 align-top text-[12.5px] text-[var(--alac-text-2)]">
                      {formatDate(p.connected_on) ?? <Blank />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length > 0 ? (
        <p className="readout mt-3 text-[13px] text-[var(--alac-text-3)]">
          Showing the {rows.length} most actionable of {s.total.toLocaleString()}.
        </p>
      ) : null}
    </div>
  );
}
