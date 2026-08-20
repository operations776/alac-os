import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  getOrgId, accountById, signalsForAccount, peopleForAccount, PRIORITY_LABEL,
  targetsForAccount, rolesForAccount, accountPackage, briefForAccount,
} from "@/lib/server/queries/desk";
import {
  Badge, Card, CardHeader, EmptyState, Eyebrow, GaugeRow, NoticeLine,
  formatDate,
} from "@/components/ui/primitives";
import {
  ExecutionStages, HEAT_COMPONENTS, HeatDelta, MotionChip, PrepChip,
  PriorityChip,
} from "@/components/ui/desk";
import { TargetList, RoleList, Brief } from "@/components/ui/targets";

export const dynamic = "force-dynamic";

// The account package, as Adrian QCs it. The instructions set the standard:
// decision-ready in five minutes or less, which is why the recommendation, the
// two prepared artefacts, and the blocking gaps are above everything else.

// READY FOR QC has a checklist attached to it, and the screen evaluates it
// rather than restating it: these are the conditions the instructions require
// to be true before an account is handed over.
function qcChecklist(a: {
  battlecard_url: string | null;
  sales_nav_url: string | null;
  recommended_motion: string;
  next_action: string | null;
}) {
  return [
    { ok: Boolean(a.battlecard_url), label: "Company battlecard is present" },
    { ok: Boolean(a.sales_nav_url), label: "One combined target lead search is ready" },
    { ok: a.recommended_motion !== "TBD", label: "Recommended motion is not TBD" },
    { ok: Boolean(a.next_action), label: "Next action is one concrete verb-led action" },
  ];
}

export default async function QueueAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const account = await accountById(orgId, id);
  if (!account) notFound();

  const [signals, people, targets, roles, pkg, brief] = await Promise.all([
    signalsForAccount(orgId, account.id),
    peopleForAccount(orgId, account.id),
    targetsForAccount(orgId, account.id),
    rolesForAccount(orgId, account.id),
    accountPackage(orgId, account.id),
    briefForAccount(orgId, account.id),
  ]);

  const checks = qcChecklist(account);
  const outstanding = checks.filter((c) => !c.ok);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <Link href="/queue" className="btn btn-ghost mb-4 -ml-4">
        <ArrowLeft size={16} strokeWidth={1.5} /> Account queue
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <Eyebrow>{account.record_id}</Eyebrow>
          <h1 className="display mt-1.5 text-[26px] leading-[1.2] sm:text-[32px]">
            {account.company_name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PriorityChip priority={account.priority} />
            <MotionChip motion={account.recommended_motion} />
            <PrepChip status={account.prep_status} />
            {account.next_week ? (
              <span className="chip bg-[var(--alac-accent-soft)] text-[var(--alac-accent-light)]">
                Next week
              </span>
            ) : null}
            <ExecutionStages
              heyreach={account.heyreach_stage}
              sourcewhale={account.sourcewhale_stage}
            />
          </div>
          {account.linkedin_url ? (
            <a
              href={account.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="link mt-3 inline-flex items-center gap-1.5 text-[13px]"
            >
              Company LinkedIn <ExternalLink size={16} strokeWidth={1.5} />
            </a>
          ) : null}
        </div>

        {/* The TAM score. Source data, so it is presented as a fact rather than
            as something this app produced. */}
        <div className="w-[196px] rounded-[var(--alac-radius-lg)] bg-[var(--alac-surface)] px-5 pb-5 pt-4 shadow-[var(--alac-elev-1)]">
          <div className="placard text-[12px] text-[var(--alac-text-2)]">
            TAM final score
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="readout text-[46px] leading-none text-[var(--alac-text)]">
              {account.final_score != null ? Math.round(Number(account.final_score)) : "--"}
            </span>
            <span className="readout text-[14px] text-[var(--alac-text-3)]">/ 100</span>
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[var(--alac-text-3)]">
            {account.priority ? PRIORITY_LABEL[account.priority] : "No priority"}. Finalized in the
            Master TAM, not set here.
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-5">
          {/* The handover. What Adrian is being asked to decide. */}
          <Card>
            <CardHeader
              title="Account package"
              sub="Decision-ready means Adrian can QC this in five minutes without more research"
            />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <ArtefactCard
                  label="Company battlecard"
                  href={account.battlecard_url}
                  missing="Not built yet. The decision brief lives here, not in the queue."
                />
                <ArtefactCard
                  label="Sales Nav target leads"
                  href={account.sales_nav_url}
                  missing="Not built yet. One combined search for the full target audience."
                />
              </div>

              {account.next_action ? (
                <div className="rounded-[var(--alac-radius)] bg-[var(--alac-accent-soft)] px-4 py-3.5">
                  <div className="placard mb-1.5 text-[12px] text-[var(--alac-accent-light)]">
                    Next action
                  </div>
                  <p className="text-[14px] leading-[1.6] text-[var(--alac-accent-light)]">
                    {account.next_action}
                  </p>
                </div>
              ) : null}

              {/* The checklist, evaluated. This is the whole handover contract,
                  so it is shown as a state rather than as instructions. */}
              <div className="well px-4 py-3.5">
                <div className="placard mb-2.5 text-[12px] text-[var(--alac-text-2)]">
                  Ready for QC checklist
                </div>
                <ul className="flex flex-col gap-2">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2.5 text-[13px]">
                      <span className="mt-[1px] shrink-0">
                        <Badge tone={c.ok ? "good" : "neutral"} withIcon>
                          {c.ok ? "Done" : "Open"}
                        </Badge>
                      </span>
                      <span
                        className={
                          c.ok
                            ? "text-[var(--alac-text-2)]"
                            : "text-[var(--alac-text)]"
                        }
                      >
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {account.prep_status === "READY FOR QC" && outstanding.length > 0 ? (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--alac-warn)]">
                    This account is marked READY FOR QC with {outstanding.length} item
                    {outstanding.length === 1 ? "" : "s"} still open. The instructions require all of
                    them to be true before handover, so either the missing work is done or the status
                    goes back to IN RESEARCH.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          {/* The brief. Only rendered when the reasoning pass produced
              something that passed the grounding check. */}
          <Card>
            <CardHeader
              title="The brief"
              sub={brief ? "Grounded in the signals and contacts below" : "Not written yet"}
            />
            <Brief brief={brief} />
          </Card>

          {/* Who to contact. The question the desk is actually asking. */}
          <Card>
            <CardHeader
              title="Who to target"
              sub={
                pkg.targets > 0
                  ? `${pkg.targets} sourced, ${pkg.warm_targets} already first degree, ${pkg.verified_emails} with a verified address`
                  : undefined
              }
            />
            <TargetList targets={targets} />
          </Card>

          {/* What they are hiring for. */}
          <Card>
            <CardHeader
              title="Open roles"
              sub={
                pkg.total_roles > 0
                  ? `${pkg.qualified_roles} ALAC qualified of ${pkg.total_roles} fetched`
                  : undefined
              }
            />
            <RoleList roles={roles} />
          </Card>

          {/* Signals. The reason to act now. */}
          <Card>
            <CardHeader
              title="Signal heat"
              sub={signals.length > 0 ? `${signals.length} scored` : undefined}
            />
            {signals.length === 0 ? (
              <EmptyState
                title="No scored signal"
                body="Nothing in the signal log is linked to this company. Without a dated signal there is no timing argument, only the standing TAM qualification."
              />
            ) : (
              <div className="flex flex-col gap-4 px-5 pb-5">
                {signals.map((s) => {
                  const parts = HEAT_COMPONENTS.map((c) => ({
                    ...c,
                    value: (s[c.key as keyof typeof s] as number | null) ?? 0,
                  }));
                  return (
                    <div key={s.id} className="well px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="readout text-[20px] text-[var(--alac-accent)]">
                          {s.heat_score ?? "--"}
                          <span className="text-[13px] text-[var(--alac-text-3)]"> / 100</span>
                        </span>
                        <HeatDelta delta={s.heat_vs_tam} />
                        <span className="readout ml-auto text-[12.5px] text-[var(--alac-text-3)]">
                          {formatDate(s.signal_date)}
                        </span>
                      </div>
                      <p className="prose-measure mt-2 text-[13.5px] leading-[1.6]">
                        {s.what_happened}
                      </p>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        {parts.map((p) => (
                          <GaugeRow key={p.key} label={p.label} value={p.value} max={p.max} />
                        ))}
                      </div>
                      {s.primary_source && /^https?:\/\//i.test(s.primary_source) ? (
                        <a
                          href={s.primary_source}
                          target="_blank"
                          rel="noreferrer"
                          className="link mt-3 inline-flex items-center gap-1.5 text-[12.5px]"
                        >
                          Source <ExternalLink size={16} strokeWidth={1.5} />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Execution" sub="Network warming first, then business development" />
            <dl className="flex flex-col gap-2.5 px-5 pb-5 text-[13px]">
              <Row label="HeyReach" value={account.heyreach_stage} />
              <Row label="First loaded" value={formatDate(account.heyreach_date) ?? "not recorded"} />
              <Row label="Uploaded" value={account.heyreach_uploaded ? "Yes" : "No"} />
              <Row label="SourceWhale" value={account.sourcewhale_stage} />
            </dl>
            <div className="px-5 pb-5">
              <NoticeLine>
                These are stage markers only. The execution detail lives in HeyReach and SourceWhale,
                and the sequence rule is that LinkedIn warming happens before the BD sequence.
              </NoticeLine>
            </div>
          </Card>

          <Card>
            <CardHeader title="People you know" sub={`${people.length} matched`} />
            {people.length === 0 ? (
              <EmptyState
                title="No warm contacts"
                body="Nobody from the connections list matched this company, so any approach here starts cold."
              />
            ) : (
              <ul className="flex flex-col gap-1 px-3 pb-3">
                {people.map((p) => (
                  <li key={p.id} className="row-hover rounded-[var(--alac-radius)] px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{p.full_name}</span>
                      {p.is_decision_maker ? (
                        <Badge tone="good" withIcon>Decision maker</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
                      {p.title ?? "Title unknown"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ArtefactCard({
  label,
  href,
  missing,
}: {
  label: string;
  href: string | null;
  missing: string;
}) {
  const isUrl = href != null && /^https?:\/\//i.test(href);
  return (
    <div
      className={`rounded-[var(--alac-radius)] px-4 py-3.5 ${
        href ? "bg-[var(--alac-surface-2)]" : "bg-[var(--alac-ground)]"
      }`}
    >
      <div
        className={`placard text-[12px] ${
          href ? "text-[var(--alac-text-2)]" : "text-[var(--alac-text-2)]"
        }`}
      >
        {label}
      </div>
      {isUrl ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="link mt-1.5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--alac-text-2)]"
        >
          Open <ExternalLink size={16} strokeWidth={1.5} />
        </a>
      ) : href ? (
        // The workbook marks some of these present with a literal placeholder
        // rather than a URL. Saying so is more useful than a dead link.
        <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--alac-text-2)]">
          Marked present in the workbook as &ldquo;{href}&rdquo;, with no URL recorded.
        </p>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
          {missing}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--alac-text-3)]">{label}</dt>
      <dd className="readout min-w-0 text-right text-[13px]">{value}</dd>
    </div>
  );
}
