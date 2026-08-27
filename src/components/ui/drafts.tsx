"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { markSent } from "@/app/(app)/queue/[id]/tracker";

// The drafted first message.
//
// Written by `npm run draft`, shown here, sent by a human. Nothing on this
// screen sends anything, which is the outbound rule and also the reason the
// only action is Copy.

export type Draft = {
  id: string;
  person_name: string;
  channel: string;
  body: string;
  opening_line: string | null;
  why_this_angle: string | null;
  facts_used: string[];
  sources: string[];
  drafted_at: string;
  sent_at: string | null;
  custom: boolean;
};

export function DraftList({ drafts }: { drafts: Draft[] }) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        title="No message drafted yet"
        body="Nothing has been written for this company. The writer researches the company and the person first, then drafts one message that could not be sent to anyone else."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} />
      ))}
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(draft.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="well px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13.5px] font-medium">To {draft.person_name}</span>
        {draft.sent_at ? (
          <span className="placard inline-flex items-center gap-1.5 rounded-[var(--alac-radius-sm)] border border-[color-mix(in_oklab,var(--alac-good)_40%,transparent)] bg-[var(--alac-good-soft)] px-2 py-1 text-[10px] text-[var(--alac-good)]">
            <Check size={16} strokeWidth={1.5} /> Sent {new Date(draft.sent_at).toLocaleDateString()}
          </span>
        ) : null}
        <span className="readout ml-auto text-[12.5px] text-[var(--alac-text-3)]">
          {draft.channel === "linkedin" ? "LinkedIn" : "Email"}{draft.custom ? ", written by you" : ""}
        </span>
      </div>

      <p className="prose-measure mt-2.5 whitespace-pre-wrap text-[13.5px] leading-[1.65]">
        {draft.body}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="btn btn-secondary">
          {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
          {copied ? "Copied" : "Copy message"}
        </button>
        {!draft.sent_at ? (
          <form action={markSent}>
            <input type="hidden" name="draftId" value={draft.id} />
            <button type="submit" className="btn btn-primary" title="Records that you sent this yourself. Nothing is sent from here.">
              Mark as sent
            </button>
          </form>
        ) : null}
        {draft.sources.slice(0, 3).map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="link inline-flex items-center gap-1.5 text-[12.5px]"
          >
            Source {i + 1} <ExternalLink size={16} strokeWidth={1.5} />
          </a>
        ))}
      </div>

      {draft.why_this_angle ? (
        <p className="mt-3 text-[12.5px] leading-snug text-[var(--alac-text-3)]">
          Why this angle: {draft.why_this_angle}
        </p>
      ) : null}

      {draft.facts_used.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-[var(--alac-text-3)]">
          {draft.facts_used.map((f) => (
            <li key={f}>Based on: {f}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
