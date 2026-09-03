import { Check, ExternalLink } from "lucide-react";
import { Badge, EmptyState, formatDate } from "./primitives";
import type { RoleRow, TargetRow } from "@/lib/server/queries/desk";
import { RevealEmail } from "./reveal-email";
import { MessageButton } from "./tracker";
import { WhyRole } from "./explain";
import { setMark } from "@/app/(app)/queue/[id]/tracker";

/** What was written to whom, keyed on person name. */
export type SentMap = Map<string, { body: string; sent_at: string | null; channel: string }>;

/**
 * Who to contact, and what they are hiring for.
 *
 * The two panels the desk actually acts on. Both are evidence, not opinion:
 * every person came from a search that is recorded, every role has a URL, and
 * the rank next to a name opens its own reasons.
 */

/**
 * One person. Rank on the left, the reasons behind it in the title attribute
 * so the ordering is never mysterious, and the email state stated exactly.
 */
export function TargetRowItem({
  target,
  accountId,
  sent,
}: {
  target: TargetRow;
  accountId: string;
  sent?: SentMap;
}) {
  const reasons = Array.isArray(target.rank_terms) ? target.rank_terms : [];
  const m = sent?.get(target.full_name);
  return (
    <li className="row-hover flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--alac-radius-sm)] px-3 py-2.5">
      <span
        className="readout w-7 shrink-0 text-right text-[13px] text-[var(--alac-accent)]"
        title={reasons.length ? reasons.join(", ") : "No ranking reasons recorded"}
      >
        {target.rank_score ?? "--"}
      </span>

      <span className="min-w-[150px] flex-1">
        {target.linkedin_url ? (
          <a
            href={target.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="link inline-flex items-center gap-1.5 text-[14px] font-medium"
          >
            {target.full_name}
            <ExternalLink size={16} strokeWidth={1.5} />
          </a>
        ) : (
          <span className="text-[14px] font-medium">{target.full_name}</span>
        )}
        <span className="block text-[12.5px] leading-snug text-[var(--alac-text-3)]">
          {target.title ?? "Title unknown"}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {target.is_warm ? <Badge tone="good">First degree</Badge> : null}
        <EmailState target={target} />
        <MessageButton
          accountId={accountId}
          person={target.full_name}
          channel={m?.channel ?? (target.email ? "email" : "linkedin")}
          body={m?.body}
          sentAt={m?.sent_at}
        />
      </span>
    </li>
  );
}

/**
 * The email. Delegated to a client component because finding one is an action
 * with a cost, not a value to render.
 */
function EmailState({ target }: { target: TargetRow }) {
  return (
    <RevealEmail
      targetId={target.id}
      email={target.email}
      status={target.email_status}
      revealed={target.email_revealed}
    />
  );
}

export function TargetList({
  targets,
  accountId,
  sent,
}: {
  targets: TargetRow[];
  accountId: string;
  sent?: SentMap;
}) {
  if (targets.length === 0) {
    return (
      <EmptyState
        title="No targets sourced"
        body="Nobody has been sourced for this account yet. Run the enrichment to pull the senior engineering and talent leaders, ranked."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5 px-3 pb-3">
      {targets.map((t) => (
        <TargetRowItem key={t.id} target={t} accountId={accountId} sent={sent} />
      ))}
    </ul>
  );
}

/**
 * The open requisitions. Qualified first, because an unqualified posting is
 * recorded for the count but is never the reason to call.
 */
export function RoleList({
  roles,
  accountId,
  mentioned,
}: {
  roles: RoleRow[];
  accountId: string;
  mentioned?: Set<string>;
}) {
  if (roles.length === 0) {
    return (
      <EmptyState
        title="No open roles on file"
        body="No requisitions have been fetched for this account. Without them the hiring urgency and talent scarcity components cannot be scored, and the signal reports them as gaps."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5 px-3 pb-3">
      {roles.map((r) => (
        <li
          key={r.id}
          className={`row-hover flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--alac-radius-sm)] px-3 py-2 ${
            r.qualified ? "" : "opacity-55"
          }`}
        >
          {/* Mentioned: he has already raised this role with someone there.
              A plain form, one row, toggled. */}
          <form action={setMark} className="shrink-0">
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="kind" value="role" />
            <input type="hidden" name="ref" value={r.id} />
            <input type="hidden" name="done" value={mentioned?.has(r.id) ? "0" : "1"} />
            <button
              type="submit"
              role="checkbox"
              aria-checked={mentioned?.has(r.id) ?? false}
              aria-label={mentioned?.has(r.id) ? "Mentioned, click to clear" : "Mark as mentioned"}
              title={mentioned?.has(r.id) ? "You have raised this role. Click to clear" : "Mark that you have raised this role with them"}
              className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border ${
                mentioned?.has(r.id)
                  ? "border-[var(--alac-good)] bg-[var(--alac-good)] text-[var(--alac-ground)]"
                  : "border-[var(--alac-line)] bg-[var(--alac-ground)] hover:border-[var(--alac-accent)]"
              }`}
            >
              {mentioned?.has(r.id) ? <Check size={16} strokeWidth={1.5} /> : null}
            </button>
          </form>
          <span className="readout w-[76px] shrink-0 text-[12px] text-[var(--alac-text-3)]">
            {formatDate(r.first_seen ?? r.posted_at) ?? "undated"}
          </span>
          {r.relevance != null ? (
            <span className="readout w-6 shrink-0 text-right text-[12px] text-[var(--alac-accent)]">
              {r.relevance}
            </span>
          ) : null}
          <span className="shrink-0"><WhyRole role={{ ...r, title: r.title }} label="" /></span>
          <span className="min-w-[180px] flex-1">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="link text-[13.5px]">
                {r.title}
              </a>
            ) : (
              <span className="text-[13.5px]">{r.title}</span>
            )}
          </span>
          {r.location ? (
            <span className="shrink-0 text-[12px] text-[var(--alac-text-3)]">{r.location}</span>
          ) : null}
          {r.salary_text ? (
            <span className="shrink-0 text-[12px] text-[var(--alac-text-2)]">{r.salary_text}</span>
          ) : null}
          {!r.qualified ? (
            <span className="chip min-h-[22px] px-2 text-[10px]" title="Recorded, but not a role ALAC would be engaged on">
              Not ALAC
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The generated brief.
 *
 * Rendered only when the reasoning pass produced something that passed the
 * grounding check. There is deliberately no fallback prose: an absent brief is
 * stated as absent, because the alternative is inventing one.
 */
export function Brief({
  brief,
}: {
  brief: {
    why_now: string | null;
    contact_first: string | null;
    next_step: string | null;
    risks: string | null;
    reasoning_model: string | null;
    reasoning_at: string | null;
  } | null;
}) {
  if (!brief) {
    return (
      <div className="px-5 pb-5">
        <p className="text-[13px] leading-relaxed text-[var(--alac-text-3)]">
          No brief yet. It is written only from the signals, open roles and contacts recorded here,
          and it names a person only if that person is on the list above. Nothing is generated
          without them.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      {brief.why_now ? <Field label="Why now" value={brief.why_now} /> : null}
      {brief.contact_first ? <Field label="Contact first" value={brief.contact_first} accent /> : null}
      {brief.next_step ? <Field label="Next step" value={brief.next_step} /> : null}
      {brief.risks ? <Field label="Risks" value={brief.risks} /> : null}
      <p className="text-[11.5px] text-[var(--alac-text-3)]">
        Written by {brief.reasoning_model ?? "the reasoning pass"}
        {brief.reasoning_at ? ` on ${formatDate(brief.reasoning_at)}` : ""}, from the signals and
        contacts on this page only. A brief that named anyone not listed above would have been
        rejected.
      </p>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        accent ? "rounded-[var(--alac-radius)] bg-[var(--alac-accent-soft)] px-4 py-3.5" : undefined
      }
    >
      <div
        className={`placard mb-1.5 text-[10px] ${
          accent ? "text-[var(--alac-accent-light)]" : "text-[var(--alac-text-2)]"
        }`}
      >
        {label}
      </div>
      <p
        className={`prose-measure text-[14px] leading-[1.6] ${
          accent ? "text-[var(--alac-accent-light)]" : "text-[var(--alac-text-2)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
