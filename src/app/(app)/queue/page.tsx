import Link from "next/link";
import { Search } from "lucide-react";
import { getOrgId, searchQueue, deskCounts } from "@/lib/server/queries/desk";
import {
  Button, Card, EmptyState, PageHeader, Th,
} from "@/components/ui/primitives";
import {
  ExecutionStages, LinkCell, MotionChip, PrepChip, PriorityChip, ScoreCell,
} from "@/components/ui/desk";
import { Row } from "@/components/ui/clickable";

export const dynamic = "force-dynamic";

// ACCOUNT QUEUE. One company, one row, one current state.
//
// Source columns (record id, priority, final score, company, LinkedIn) are
// read only here by design, not by omission: the operating instructions place
// them under the Master TAM and say not to change them.

const PRIORITIES = [
  { value: "", label: "Any priority" },
  { value: "priority_1", label: "Priority 1" },
  { value: "priority_2", label: "Priority 2" },
  { value: "priority_3", label: "Priority 3" },
  { value: "unscored", label: "UNSCORED" },
];

const PREP = [
  { value: "", label: "Any progress" },
  { value: "NOT STARTED", label: "Not started" },
  { value: "IN RESEARCH", label: "In research" },
  { value: "READY FOR QC", label: "Needs review" },
  { value: "APPROVED", label: "Approved" },
  { value: "HOLD", label: "Hold" },
];

const MOTIONS = [
  { value: "", label: "Any approach" },
  { value: "TBD", label: "Not decided" },
  { value: "LIVE LEAD", label: "Live lead" },
  { value: "GENERAL BD", label: "New business" },
  { value: "MPC WEDGE", label: "Lead with a candidate" },
  { value: "NURTURE", label: "Nurture" },
  { value: "HOLD", label: "Hold" },
];

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; priority?: string; prep?: string; motion?: string;
    next?: string; page?: string;
  }>;
}) {
  const params = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
        <Card>
          <EmptyState title="No organization" body="Seed an org before opening the queue." />
        </Card>
      </div>
    );
  }

  const q = params.q ?? "";
  const priority = params.priority ?? "";
  const prep = params.prep ?? "";
  const motion = params.motion ?? "";
  const onlyNext = params.next === "1";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ rows, total, perPage }, counts] = await Promise.all([
    searchQueue(orgId, { q, priority, prep, motion, nextWeek: onlyNext, page, perPage: 50 }),
    deskCounts(orgId),
  ]);

  const pages = Math.ceil(total / perPage);
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  const filtered = Boolean(q || priority || prep || motion || onlyNext);

  const href = (next: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      q, priority, prep, motion, next: onlyNext ? "1" : "", page, ...next,
    } as Record<string, string | number | undefined>;
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && !(k === "page" && v === 1)) sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? `/queue?${s}` : "/queue";
  };

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Companies"
        title={`${total.toLocaleString()} ${total === 1 ? "company" : "companies"}`}
        lede={
          filtered
            ? "Filtered view. Clear the filters to see the whole queue."
            : "One company, one row, one current state. Record ID, priority and final score come from the Master TAM and are read only here."
        }
        right={
          <span className="flex items-center gap-2">
            {counts.ready_for_qc > 0 ? (
              <Link href="/queue?prep=READY+FOR+QC" className="btn btn-secondary">
                {counts.ready_for_qc} need review
              </Link>
            ) : null}
            <Link href="/queue/new" className="btn btn-primary">Add a company</Link>
          </span>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[280px]">
          <span
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--alac-text-2)]"
            aria-hidden="true"
          >
            <Search size={16} strokeWidth={1.5} />
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="company or record id"
            aria-label="Search the queue"
            className="field pl-11"
          />
        </div>
        <select name="priority" defaultValue={priority} aria-label="Filter by priority" className="field w-auto">
          {PRIORITIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select name="prep" defaultValue={prep} aria-label="Filter by progress" className="field w-auto">
          {PREP.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select name="motion" defaultValue={motion} aria-label="Filter by approach" className="field w-auto">
          {MOTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="chip cursor-pointer select-none">
          <input
            type="checkbox"
            name="next"
            value="1"
            defaultChecked={onlyNext}
            className="h-4 w-4 accent-[var(--alac-accent)]"
          />
          Next week only
        </label>
        <Button type="submit" variant="primary">Apply</Button>
        {filtered ? <Link href="/queue" className="btn btn-ghost">Clear</Link> : null}
      </form>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No matches"
            body="No company matched these filters. Try a different term or clear the filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="bg-[var(--alac-ground)]">
                  <Th align="right">Fit</Th>
                  <Th>Company</Th>
                  <Th>Priority</Th>
                  <Th>This week</Th>
                  <Th>Approach</Th>
                  <Th>Progress</Th>
                  <Th>Brief</Th>
                  <Th>Outreach</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <Row key={a.id} href={`/queue/${a.id}`} className="row-hover border-b border-[var(--alac-line)] last:border-0">
                    <td className="px-4 py-2.5 text-right align-top">
                      <ScoreCell score={a.final_score} />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">
                        {a.company_name}
                      </Link>
                      <div className="readout mt-0.5 text-[12px] text-[var(--alac-text-3)]">
                        {a.record_id}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top"><PriorityChip priority={a.priority} /></td>
                    <td className="px-4 py-2.5 align-top">
                      {a.next_week ? (
                        <span className="chip min-h-[24px] bg-[var(--alac-accent-soft)] px-2.5 text-[11px] text-[var(--alac-accent-light)]">
                          YES
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-[var(--alac-text-3)]">no</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top"><MotionChip motion={a.recommended_motion} /></td>
                    <td className="px-4 py-2.5 align-top"><PrepChip status={a.prep_status} /></td>
                    <td className="px-4 py-2.5 align-top"><LinkCell href={a.battlecard_url} label="Card" /></td>
                    <td className="px-4 py-2.5 align-top">
                      <ExecutionStages heyreach={a.heyreach_stage} sourcewhale={a.sourcewhale_stage} />
                    </td>
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="readout text-[13px] text-[var(--alac-text-3)]">
            {first.toLocaleString()}&ndash;{last.toLocaleString()} of {total.toLocaleString()}
            {pages > 1 ? `, page ${page} of ${pages.toLocaleString()}` : ""}
          </span>
          {pages > 1 ? (
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="btn btn-secondary">Previous</Link>
              ) : null}
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="btn btn-secondary">Next</Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
