import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  getOrgId, accountById, signalsForAccount, peopleForAccount, PRIORITY_LABEL,
  targetsForAccount, rolesForAccount, accountPackage, briefForAccount,
  draftsForAccount, notesForAccount, marksForAccount, movesForAccount,
  touchesForAccount,
} from "@/lib/server/queries/desk";
import { sql } from "@/lib/server/db";
import { laneOf } from "@/lib/scoring/personas.mjs";
import {
  Badge, Card, CardHeader, EmptyState, GaugeRow, NoticeLine,
  formatDate,
} from "@/components/ui/primitives";
import {
  ExecutionStages, HEAT_COMPONENTS, HeatDelta, MotionChip, PrepChip,
  PriorityChip, NextMove, LifecycleChip,
} from "@/components/ui/desk";
import { TargetList, RoleList, Brief, type SentMap } from "@/components/ui/targets";
import { DraftList } from "@/components/ui/drafts";
import { NoteForm, MessageButton } from "@/components/ui/tracker";
import { PinControl } from "@/components/ui/pin";
import { OrgMap } from "@/components/ui/org-map";
import { setSourceWhale, setDisposition } from "./org";
import { setMark } from "./tracker";

export const dynamic = "force-dynamic";

const SW_STATES = [
  "Not Added", "Added", "Active Campaign", "Paused", "Replied",
  "Positive Reply", "Completed",
];

// One company: what changed, what they are hiring for, who to contact, and
// what has been done about it. The second half is the tracker: notes, marks,
// and the messages he wrote and sent. The desk finds; he records.

function qcChecklist(
  a: {
    battlecard_url: string | null;
    recommended_motion: string;
    next_action: string | null;
    top_contact: string | null;
    has_draft: boolean;
    contacted_count: number;
  },
  marks: Set<string>,
) {
  // Each item is auto-detected where the desk can see it, and can be marked
  // done by hand where it cannot. A hand mark says what closes it.
  const item = (key: string, auto: boolean, label: string, fix: string) => ({
    key,
    auto,
    manual: marks.has(`check:${key}`),
    ok: auto || marks.has(`check:${key}`),
    label,
    fix,
  });
  return [
    item("contact", Boolean(a.top_contact), "A contact is named", "Source people, or match the warm network, or mark done if you know who"),
    item("message", a.has_draft, "The first message is written", "Use Message on a person below, or run the draft"),
    item("sent", a.contacted_count > 0, "Somebody has been messaged", "Save a message and mark it sent"),
    item("approach", a.recommended_motion !== "TBD", "Approach is decided", "New business, live lead, or lead with a candidate"),
    item("brief", Boolean(a.battlecard_url), "Research brief is written", "Write the brief, or mark done if it lives elsewhere"),
    item("next", Boolean(a.next_action), "Next action is written down", "Add a note below: who, what, when"),
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

  const [signals, people, targets, roles, pkg, brief, drafts, notes, marks, moves, touches] = await Promise.all([
    signalsForAccount(orgId, account.id),
    peopleForAccount(orgId, account.id),
    targetsForAccount(orgId, account.id),
    rolesForAccount(orgId, account.id),
    accountPackage(orgId, account.id),
    briefForAccount(orgId, account.id),
    draftsForAccount(orgId, account.id),
    notesForAccount(orgId, account.id),
    marksForAccount(orgId, account.id),
    movesForAccount(orgId, account.id),
    touchesForAccount(orgId, account.id),
  ]);

  // Everyone known at this company, sorted into the six organizational
  // levels. The lane is derived from the title rather than stored, so a
  // re-import of the network keeps the map accurate without a migration.
  const laneRows = (await sql`
    select full_name, title from people
     where org_id = ${orgId} and account_id = ${account.id}
     union all
    select full_name, title from account_targets
     where org_id = ${orgId} and account_id = ${account.id}
  `) as { full_name: string; title: string | null }[];
  const lanePeople = laneRows.map((p) => ({ ...p, lane: laneOf(p.title ?? "") as string | null }));

  const checks = qcChecklist(account, marks);
  const outstanding = checks.filter((c) => !c.ok);
  const sent: SentMap = new Map(
    drafts.map((d) => [d.person_name, { body: d.body, sent_at: d.sent_at, channel: d.channel }]),
  );
  const mentioned = new Set(
    [...marks].filter((m) => m.startsWith("role:")).map((m) => m.slice(5)),
  );
  const site = account.domain ? `https://${account.domain.replace(/^https?:\/\//, "")}` : null;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <Link href="/queue" className="btn btn-ghost mb-4 -ml-4">
        <ArrowLeft size={16} strokeWidth={1.5} /> All companies
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <h1 className="display mt-1.5 text-[26px] leading-[1.2] sm:text-[32px]">
            {account.company_name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LifecycleChip row={account} />
            <PriorityChip priority={account.priority} />
            <MotionChip motion={account.recommended_motion} />
            <PrepChip status={account.prep_status} />
            <PinControl
              accountId={account.id}
              systemBand={account.work_band}
              systemRank={account.work_score}
              pinnedBand={account.pinned_band}
              pinnedRank={account.pinned_rank}
              pinReason={account.pin_reason}
              pinExpires={account.pin_expires}
              pinActive={account.pin_active}
            />
            {account.effective_band ? (
              <span className="chip">
                {account.effective_band === "now" ? "Work now" : account.effective_band === "next" ? "Up next" : "Backlog"}
              </span>
            ) : null}
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
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {site ? (
              <a href={site} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
                {account.domain} <ExternalLink size={16} strokeWidth={1.5} />
              </a>
            ) : (
              <span className="text-[var(--alac-text-3)]">No website on file</span>
            )}
            {account.hq ? <span className="text-[var(--alac-text-3)]">{account.hq}</span> : null}
            {account.linkedin_url ? (
              <a
                href={account.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-1.5"
              >
                Company LinkedIn <ExternalLink size={16} strokeWidth={1.5} />
              </a>
            ) : null}
            {account.last_contacted_at ? (
              <span className="text-[var(--alac-good)]">
                Messaged {account.last_contacted_name} {formatDate(account.last_contacted_at)}
                {account.contacted_count > 1 ? `, ${account.contacted_count} people so far` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="w-[196px] rounded-[var(--alac-radius-lg)] bg-[var(--alac-surface)] px-5 pb-5 pt-4 shadow-[var(--alac-elev-1)]">
          <div className="placard text-[12px] text-[var(--alac-text-2)]">Fit score</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="readout text-[46px] leading-none text-[var(--alac-text)]">
              {account.final_score != null ? Math.round(Number(account.final_score)) : "--"}
            </span>
            <span className="readout text-[14px] text-[var(--alac-text-3)]">/ 100</span>
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[var(--alac-text-3)]">
            {account.priority ? PRIORITY_LABEL[account.priority] : "No priority"}. Set in the master
            list, not here.
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-5">
          {/* The handover: the next move, and the checklist as a set of jobs. */}
          <Card>
            <CardHeader
              title="Ready to work?"
              sub="The next move, and what is still open. Tick anything you have done outside this page"
            />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <div className="rounded-[var(--alac-radius)] bg-[var(--alac-surface-2)] px-4 py-3.5">
                <div className="placard mb-2 text-[12px] text-[var(--alac-text-2)]">Next move</div>
                <NextMove row={account} />
                {account.work_reason ? (
                  <p className="mt-2 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
                    Why it is on the list: {account.work_reason}
                  </p>
                ) : null}
                {moves.length > 0 ? (
                  <p className="mt-1 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
                    {moves.map((m) => `${m.reason}, ${formatDate(m.moved_at)}`).join(" · ")}
                  </p>
                ) : null}
              </div>

              {account.next_action ? (
                <div className="rounded-[var(--alac-radius)] bg-[var(--alac-accent-soft)] px-4 py-3.5">
                  <div className="placard mb-1.5 text-[12px] text-[var(--alac-accent-light)]">
                    Next action, from the workbook
                  </div>
                  <p className="text-[14px] leading-[1.6] text-[var(--alac-accent-light)]">
                    {account.next_action}
                  </p>
                </div>
              ) : null}

              <div className="well px-4 py-3.5">
                <div className="placard mb-2.5 text-[12px] text-[var(--alac-text-2)]">
                  Before you review
                </div>
                <ul className="flex flex-col gap-2">
                  {checks.map((c) => (
                    <li key={c.key} className="flex items-start gap-2.5 text-[13px]">
                      {/* Auto-detected items cannot be unticked: the desk saw
                          it. Hand marks can be cleared. */}
                      <form action={setMark} className="mt-[1px] shrink-0">
                        <input type="hidden" name="accountId" value={account.id} />
                        <input type="hidden" name="kind" value="check" />
                        <input type="hidden" name="ref" value={c.key} />
                        <input type="hidden" name="done" value={c.manual ? "0" : "1"} />
                        <button
                          type="submit"
                          disabled={c.auto}
                          title={c.auto ? "Detected automatically" : c.manual ? "Marked done by you. Click to clear" : "Mark done"}
                          className="disabled:cursor-default"
                        >
                          <Badge tone={c.ok ? "good" : "neutral"} withIcon>
                            {c.ok ? "Done" : "Mark done"}
                          </Badge>
                        </button>
                      </form>
                      <span className={c.ok ? "text-[var(--alac-text-2)]" : "text-[var(--alac-text)]"}>
                        {c.label}
                        {c.manual && !c.auto ? (
                          <span className="text-[var(--alac-text-3)]"> (by you)</span>
                        ) : null}
                        {!c.ok ? (
                          <span className="block text-[12px] leading-snug text-[var(--alac-text-3)]">{c.fix}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>

                {account.prep_status === "READY FOR QC" && outstanding.length > 0 ? (
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--alac-warn)]">
                    Marked ready for review with {outstanding.length} item
                    {outstanding.length === 1 ? "" : "s"} still open.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          {/* Who has been approached, at which level. Section 14. */}
          <Card>
            <CardHeader
              title="Organization penetration"
              sub={`${account.lanes_touched} of six levels approached, ${account.lanes_engaged} in conversation`}
            />
            <OrgMap
              accountId={account.id}
              touches={touches}
              people={lanePeople}
              freshRoles={account.fresh_roles}
              roleTitles={roles.filter((r) => r.qualified).slice(0, 20).map((r) => r.title)}
            />
          </Card>

          {/* The tracker: what he did. */}
          <Card>
            <CardHeader
              title="Notes"
              sub={notes.length > 0 ? `${notes.length} so far, newest first` : "Who you spoke to, what they said, what happens next"}
            />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <NoteForm accountId={account.id} />
              {notes.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {notes.map((n) => (
                    <li key={n.id} className="well px-4 py-3">
                      <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6]">{n.body}</p>
                      <div className="readout mt-1.5 text-[11.5px] text-[var(--alac-text-3)]">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Messages"
              sub={
                drafts.length > 0
                  ? `${drafts.filter((d) => d.sent_at).length} sent, ${drafts.filter((d) => !d.sent_at).length} drafted. Sent by you, never from here`
                  : "Nothing written yet. Use Message on any person below"
              }
            />
            <DraftList drafts={drafts} />
          </Card>

          <Card>
            <CardHeader
              title="Who to contact"
              sub={
                pkg.targets > 0
                  ? `${pkg.targets} sourced, ${pkg.warm_targets} already first degree, ${pkg.verified_emails} with a verified address`
                  : people.length > 0
                    ? `${people.length} from your own network`
                    : undefined
              }
            />
            <TargetList targets={targets} accountId={account.id} sent={sent} />
            <div className="px-5 pb-4">
              <MessageButton accountId={account.id} person="Someone else" />
              <span className="ml-2 text-[12px] text-[var(--alac-text-3)]">
                For a person not on this list. Change the name in the message when you send it.
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Open roles"
              sub={
                pkg.total_roles > 0
                  ? `${pkg.qualified_roles} relevant of ${pkg.total_roles} found, most relevant first. Tick the ones you have raised`
                  : undefined
              }
            />
            <RoleList roles={roles} accountId={account.id} mentioned={mentioned} />
          </Card>

          <Card>
            <CardHeader
              title="The brief"
              sub={brief ? "Grounded in the signals and contacts below" : "Not written yet"}
            />
            <Brief brief={brief} />
          </Card>

          <Card>
            <CardHeader
              title="What changed"
              sub={signals.length > 0 ? `${signals.length} on record, newest first` : undefined}
            />
            {signals.length === 0 ? (
              <EmptyState
                title="Nothing recorded"
                body="No signal is linked to this company yet. The next refresh pulls the feed for it."
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
                      <p className="prose-measure mt-2 text-[13.5px] leading-[1.6]">{s.what_happened}</p>
                      {s.detail ? (
                        <p className="prose-measure mt-2 text-[13px] leading-[1.65] text-[var(--alac-text-2)]">
                          {s.detail}
                        </p>
                      ) : null}
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
            <CardHeader
              title="SourceWhale"
              sub="Loaded is not the same as being worked"
            />
            <form action={setSourceWhale} className="flex flex-col gap-2.5 px-5 pb-5">
              <input type="hidden" name="accountId" value={account.id} />
              <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--alac-text-2)]">
                State
                <select name="state" defaultValue={account.sw_state} className="field">
                  {SW_STATES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--alac-text-2)]">
                Campaign
                <input name="campaign" defaultValue={account.sw_campaign ?? ""} maxLength={200} className="field" />
              </label>
              <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--alac-text-2)]">
                Contacts active
                <input name="contacts" type="number" min={0} max={9999} defaultValue={account.sw_contacts ?? ""} className="field" />
              </label>
              <button type="submit" className="btn btn-secondary">Save</button>
              {account.sw_last_activity ? (
                <span className="text-[12px] text-[var(--alac-text-3)]">
                  Last activity {formatDate(account.sw_last_activity)}
                </span>
              ) : null}
            </form>
            <div className="px-5 pb-5">
              <NoticeLine>
                Recorded by hand until the API key arrives. The integration writes these same
                fields, so nothing here is redone.
              </NoticeLine>
            </div>
          </Card>

          {/* Disposition. Section 15.1: never a hard delete, always a choice
              about which kind of stop this is. */}
          <Card>
            <CardHeader title="Working this account?" sub="Each answer changes what the desk recommends" />
            <form action={setDisposition} className="flex flex-col gap-2.5 px-5 pb-5">
              <input type="hidden" name="accountId" value={account.id} />
              <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--alac-text-2)]">
                Disposition
                <select name="disposition" defaultValue={account.disposition} className="field">
                  <option value="Active">Active, recommend it</option>
                  <option value="Hold">On hold, keep watching, no outreach</option>
                  <option value="Nurture">Nurture, only on a strong signal</option>
                  <option value="Disqualified">Disqualified, keep the history</option>
                  <option value="Archived">Archived, hide but keep searchable</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--alac-text-2)]">
                Reason
                <input name="reason" defaultValue={account.disposition_reason ?? ""} maxLength={300} className="field" />
              </label>
              <button type="submit" className="btn btn-secondary">Save</button>
            </form>
          </Card>

          <Card>
            <CardHeader title="LinkedIn warming" sub="Before the email sequence" />
            <dl className="flex flex-col gap-2.5 px-5 pb-5 text-[13px]">
              <Row label="Stage" value={account.heyreach_stage} />
              <Row label="First loaded" value={formatDate(account.heyreach_date) ?? "not recorded"} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="People you already know" sub={`${people.length} matched`} />
            {people.length >= 2 ? (
              <div className="px-5 pb-1">
                <NoticeLine>
                  You know {people.length} people here. An introduction from one of them opens better
                  than anything cold. Ask the closest one first.
                </NoticeLine>
              </div>
            ) : null}
            {people.length === 0 ? (
              <EmptyState
                title="No warm contacts"
                body="Nobody from the connections list matched this company, so any approach here starts cold."
              />
            ) : (
              <ul className="flex flex-col gap-1 px-3 pb-3">
                {people.map((p, i) => {
                  const m = sent.get(p.full_name);
                  return (
                    <li key={p.id} className="row-hover rounded-[var(--alac-radius)] px-3 py-2.5">
                      {i === 0 && people.length > 1 ? (
                        <div className="placard mb-1 text-[10px] text-[var(--alac-accent)]">Ask first</div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        {p.linkedin_url ? (
                          <a
                            href={p.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="link inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium"
                          >
                            <span className="truncate">{p.full_name}</span>
                            <ExternalLink size={16} strokeWidth={1.5} />
                          </a>
                        ) : (
                          <span className="truncate text-[13.5px] font-medium">{p.full_name}</span>
                        )}
                        <span className="ml-auto flex shrink-0 items-center gap-1.5">
                          {p.is_decision_maker ? (
                            <Badge tone="good" withIcon>Decision maker</Badge>
                          ) : null}
                          <MessageButton
                            accountId={account.id}
                            person={p.full_name}
                            channel={m?.channel ?? "linkedin"}
                            body={m?.body}
                            sentAt={m?.sent_at}
                            compact
                          />
                        </span>
                      </div>
                      <div className="mt-1 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
                        {p.title ?? "Title unknown"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
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
