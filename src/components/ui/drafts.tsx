"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";

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
        <span className="readout ml-auto text-[12.5px] text-[var(--alac-text-3)]">
          {draft.channel === "linkedin" ? "LinkedIn" : "Email"}
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
