"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, SendHorizonal } from "lucide-react";
import { pushToBoard, pushCandidateToBoard } from "@/lib/server/ops/actions/push-to-board";

// PUSH TO THE BOARD. One click from a lead on the desk to a card on the GTM
// Kanban, where the research actually gets done.
//
// No dialog: there is nothing to decide and nothing to lose, because pushing
// the same thing twice updates one card rather than making a second. The
// button reports what happened and links to the card, so the next click is
// obvious rather than a hunt through the board.

type State = { done: boolean; already: boolean; error: string | null };

function Pushed({ already }: { already: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--alac-good)]">
      <Check size={16} strokeWidth={1.5} />
      {already ? "Already on the board" : "On the board"}
      <Link href="/gtm" className="link">Open</Link>
    </span>
  );
}

export function PushToBoard({
  accountId,
  roleId,
  label = "Work this",
  compact,
}: {
  accountId: string;
  roleId: string;
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<State>({ done: false, already: false, error: null });
  const [pending, start] = useTransition();

  if (state.done) return <Pushed already={state.already} />;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await pushToBoard({ accountId, roleId });
            setState(
              res.ok
                ? { done: true, already: Boolean(res.data?.already), error: null }
                : { done: false, already: false, error: res.error },
            );
          })
        }
        title="Send this requisition to the GTM board as a live lead to research"
        className="inline-flex items-center gap-1 text-[var(--alac-text-3)] transition-colors hover:text-[var(--alac-accent)] disabled:opacity-60"
      >
        <SendHorizonal size={16} strokeWidth={1.5} />
        {compact ? null : <span className="text-[11.5px]">{pending ? "Sending" : label}</span>}
      </button>
      {state.error ? (
        <span className="text-[11.5px] text-[var(--alac-red-text)]">{state.error}</span>
      ) : null}
    </span>
  );
}

/** The same, for a candidate going to market. */
export function PushCandidateToBoard({ candidateId }: { candidateId: string }) {
  const [state, setState] = useState<State>({ done: false, already: false, error: null });
  const [pending, start] = useTransition();

  if (state.done) return <Pushed already={state.already} />;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await pushCandidateToBoard(candidateId);
            setState(
              res.ok
                ? { done: true, already: Boolean(res.data?.already), error: null }
                : { done: false, already: false, error: res.error },
            );
          })
        }
        title="Send this candidate to the GTM board as an MPC to take to market"
        className="btn btn-secondary"
      >
        <SendHorizonal size={16} strokeWidth={1.5} />
        {pending ? "Sending" : "Take to market"}
      </button>
      {state.error ? (
        <span className="text-[11.5px] text-[var(--alac-red-text)]">{state.error}</span>
      ) : null}
    </span>
  );
}
