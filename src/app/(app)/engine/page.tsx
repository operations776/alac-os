import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/portfolio";
import { Card, CardHeader, Badge, Eyebrow, EmptyState, formatDate } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  kind: string;
  status: string;
  trigger: string;
  items_total: number;
  items_ok: number;
  items_failed: number;
  cost_usd: string;
  duration_ms: number | null;
  started_at: string;
  prompt_version: string | null;
};

export default async function EnginePage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return <div className="p-8"><EmptyState title="No data yet" body="Run the importers first." /></div>;
  }

  const runs = (await sql`
    select id, kind, status, trigger, items_total, items_ok, items_failed,
           cost_usd, duration_ms, started_at, prompt_version
      from agent_runs
     where org_id = ${orgId}
     order by started_at desc
     limit 25
  `) as RunRow[];

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <header className="mb-5">
        <Eyebrow>Engine</Eyebrow>
        <h1 className="mt-1.5 text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">
          Every run, logged
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[14px] text-[var(--ink-2)]">
          Each import and scoring pass writes its own row before it starts work, so a crash still leaves
          evidence rather than a silent gap. Failed items are counted honestly rather than hidden.
        </p>
      </header>

      <Card>
        <CardHeader title="Recent runs" sub={`${runs.length} shown`} />
        {runs.length === 0 ? (
          <EmptyState title="No runs yet" body="Import and score to see history here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Kind", "Status", "Trigger", "Items", "Failed", "Duration", "Started"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] ${
                        i === 3 || i === 4 || i === 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">
                      {r.kind.replace(/_/g, " ")}
                      {r.prompt_version ? (
                        <span className="ml-2 text-[11.5px] font-normal text-[var(--ink-3)]">
                          {r.prompt_version}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "complete" ? (
                        <Badge tone="good">Complete</Badge>
                      ) : r.status === "running" ? (
                        <Badge tone="warn">Running</Badge>
                      ) : r.status === "partial" ? (
                        <Badge tone="warn">Partial</Badge>
                      ) : (
                        <Badge tone="bad">Failed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">{r.trigger}</td>
                    <td className="tabular px-4 py-2.5 text-right text-[13px]">
                      {r.items_ok.toLocaleString()}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[13px]">
                      {r.items_failed > 0 ? (
                        <span className="font-semibold text-[var(--bad)]">{r.items_failed}</span>
                      ) : (
                        <span className="text-[var(--ink-3)]">0</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[12.5px] text-[var(--ink-2)]">
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">
                      {formatDate(r.started_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
