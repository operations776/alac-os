import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/portfolio";
import {
  Badge, Blank, Card, CardHeader, EmptyState, PageHeader, Th, formatDate,
} from "@/components/ui/primitives";

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

/**
 * A run's outcome as a single bar: the ok share and the failed share, drawn to
 * the same scale across every row so a bad run is visible before it is read.
 * The counts are printed beside it, always. The bar never replaces them.
 */
function RunBar({ ok, failed }: { ok: number; failed: number }) {
  const total = ok + failed;
  if (total === 0) return null;
  const okPct = (ok / total) * 100;
  return (
    <span
      aria-hidden="true"
      className="relative mt-1.5 flex h-[5px] w-full min-w-[70px] overflow-hidden rounded-[2px] bg-[var(--surface-2)]"
    >
      <span
        style={{ width: `${okPct}%`, background: "color-mix(in oklab, var(--good) 60%, transparent)" }}
      />
      <span
        style={{ width: `${100 - okPct}%`, background: "var(--bad)" }}
      />
    </span>
  );
}

export default async function EnginePage() {
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

  const runs = (await sql`
    select id, kind, status, trigger, items_total, items_ok, items_failed,
           cost_usd, duration_ms, started_at, prompt_version
      from agent_runs
     where org_id = ${orgId}
     order by started_at desc
     limit 25
  `) as RunRow[];

  const failedRuns = runs.filter((r) => r.items_failed > 0).length;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Engine"
        title="Every run, logged"
        lede="Each import and scoring pass writes its own row before it starts work, so a crash still leaves evidence rather than a silent gap. Failed items are counted honestly rather than hidden."
      />

      <Card>
        <CardHeader
          title="Recent runs"
          sub={`${runs.length} shown`}
          right={
            runs.length > 0 ? (
              failedRuns > 0 ? (
                <Badge tone="warn" withIcon>
                  {failedRuns} run{failedRuns === 1 ? "" : "s"} with failures
                </Badge>
              ) : (
                <Badge tone="good" withIcon>No failed items</Badge>
              )
            ) : null
          }
        />
        {runs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Nothing has been imported or scored for this organization, so there is no history to show."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                  <Th>Kind</Th>
                  <Th>Status</Th>
                  <Th>Trigger</Th>
                  <Th align="right">Ok</Th>
                  <Th align="right">Failed</Th>
                  <Th align="right">Duration</Th>
                  <Th>Started</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--line)] last:border-0 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="text-[13px] font-semibold">{r.kind.replace(/_/g, " ")}</div>
                      {r.prompt_version ? (
                        <div className="readout mt-0.5 text-[11px] text-[var(--ink-3)]">
                          {r.prompt_version}
                        </div>
                      ) : null}
                      <RunBar ok={r.items_ok} failed={r.items_failed} />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {r.status === "complete" ? (
                        <Badge tone="good" withIcon>Complete</Badge>
                      ) : r.status === "running" ? (
                        <Badge tone="warn" withIcon>Running</Badge>
                      ) : r.status === "partial" ? (
                        <Badge tone="warn" withIcon>Partial</Badge>
                      ) : (
                        <Badge tone="bad" withIcon>Failed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] text-[var(--ink-2)]">
                      {r.trigger}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[13px]">
                      {r.items_ok.toLocaleString()}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[13px]">
                      {r.items_failed > 0 ? (
                        <span className="font-semibold text-[var(--bad)]">
                          {r.items_failed.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[var(--ink-3)]">0</span>
                      )}
                    </td>
                    <td className="readout px-4 py-2.5 text-right align-top text-[12.5px] text-[var(--ink-2)]">
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : <Blank />}
                    </td>
                    <td className="readout px-4 py-2.5 align-top text-[12px] text-[var(--ink-2)]">
                      {formatDate(r.started_at) ?? <Blank />}
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
