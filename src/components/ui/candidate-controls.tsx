"use client";

import { useActionState, useState } from "react";
import { Pencil, Undo2, UserMinus } from "lucide-react";
import { Dialog } from "./dialog";
import {
  deactivateCandidate,
  reactivateCandidate,
  updateCandidate,
  type CandidateState,
} from "@/app/(app)/talent/actions";
import { CANDIDATE_OFF_REASONS } from "@/config/candidate-reasons.mjs";
import type { Candidate } from "@/lib/server/queries/talent";

/**
 * Take a candidate off the market, with a reason.
 *
 * Placed is a reason, and the most important one: it is the outcome the desk
 * exists for, so removing a placed candidate has to keep the record rather
 * than erase it.
 */
export function DeactivateCandidate({ candidateId }: { candidateId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Take them off the market. Nothing is deleted and you can put them back"
        className="btn btn-ghost"
      >
        <UserMinus size={16} strokeWidth={1.5} />
        Off the market
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Take this candidate off the market"
        sub="They leave the Talent list and stop matching against roles. Nothing is deleted: the classification, the score and every role pitched stay, and one click puts them back."
      >
        <form action={deactivateCandidate} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
          <input type="hidden" name="candidateId" value={candidateId} />
          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Why
            <select name="reason" defaultValue={CANDIDATE_OFF_REASONS[0]} className="field">
              {CANDIDATE_OFF_REASONS.map((r: string) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Take them off</button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** One click, no dialog: putting somebody back needs no reason. */
export function ReactivateCandidate({ candidateId }: { candidateId: string }) {
  return (
    <form action={reactivateCandidate} className="inline-flex">
      <input type="hidden" name="candidateId" value={candidateId} />
      <button type="submit" title="Put them back on the market" className="btn btn-secondary">
        <Undo2 size={16} strokeWidth={1.5} />
        Back on the market
      </button>
    </form>
  );
}

/**
 * Correct what the parser read.
 *
 * The classifier fills these fields from pasted text and gets some of them
 * wrong. Until now the only way to fix a title or a missed clearance was to
 * add the candidate a second time, which left two rows and two scores.
 */
export function EditCandidate({ candidate }: { candidate: Candidate }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CandidateState, FormData>(updateCandidate, {});

  const field = (label: string, name: string, value: string | null, placeholder?: string) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
      {label}
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} maxLength={300} className="field" />
    </label>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Correct anything the parser got wrong" className="btn btn-ghost">
        <Pencil size={16} strokeWidth={1.5} />
        Edit
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${candidate.full_name}`}
        sub="Everything the parser read from the profile. The marketability score is recomputed from what you save."
      >
        {/* Keyed on the stored values, so a save remounts the fields rather
            than leaving them showing what they first rendered with. */}
        <form
          key={`${candidate.title}-${candidate.clearance}-${candidate.domains}-${candidate.mpc_score}`}
          action={action}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="candidateId" value={candidate.id} />
          {field("Name", "name", candidate.full_name)}
          {field("Current title", "title", candidate.title, "Director of Business Development")}
          {field("Current company", "company", candidate.company)}
          {field("Where they will work", "geography", candidate.geography, "DMV, or remote plus travel")}
          {field("Clearance", "clearance", candidate.clearance, "TS/SCI, Secret, or blank")}
          {field("Domains", "domains", candidate.domains, "UAS, Navy, autonomy")}
          {field("LinkedIn", "linkedin", candidate.linkedin_url)}
          {field("Target compensation", "comp", candidate.comp_target)}
          <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
            Profile text
            <textarea
              name="summary"
              rows={6}
              maxLength={20000}
              defaultValue={candidate.summary ?? ""}
              className="field resize-y"
            />
            <span className="text-[12px] text-[var(--alac-text-3)]">
              What the match is run against. Leave it alone to keep what is stored.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Saving" : "Save"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Close</button>
            {state.error ? (
              <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
            ) : null}
          </div>
        </form>
      </Dialog>
    </>
  );
}
