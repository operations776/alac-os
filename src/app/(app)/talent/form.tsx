"use client";

import { useActionState } from "react";
import { addCandidate } from "./actions";

/**
 * Paste a profile. Everything the classifier can read from the text is filled
 * in automatically; everything it fills is editable, because the brief asks
 * for owner refinement regardless of what the classification decided.
 */
export function AnalyzeCandidateForm() {
  const [state, action, pending] = useActionState(addCandidate, { error: null });
  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
      {label}
      {input}
      {hint ? <span className="text-[12px] text-[var(--alac-text-3)]">{hint}</span> : null}
    </label>
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {field("Name", <input name="name" required maxLength={200} className="field" />)}
      {field("Current title", <input name="title" maxLength={200} placeholder="Director of Business Development" className="field" />)}
      {field("Current company", <input name="company" maxLength={200} className="field" />)}
      {field(
        "Resume or profile text",
        <textarea name="summary" rows={8} maxLength={20000} placeholder="Paste the CV or LinkedIn profile. Clearance and domains are read from this automatically." className="field resize-y" />,
        "The more text, the better the match.",
      )}
      {field("Where they will work", <input name="geography" maxLength={200} placeholder="DMV, or remote plus travel" className="field" />)}
      {field("Clearance", <input name="clearance" maxLength={100} placeholder="Read from the text if left blank" className="field" />)}
      {field("Domains", <input name="domains" maxLength={500} placeholder="UAS, Navy, autonomy. Read from the text if left blank" className="field" />)}
      {field("Target compensation", <input name="comp" maxLength={100} className="field" />)}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Analyzing" : "Analyze and search demand"}
        </button>
        {state.error ? <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span> : null}
      </div>
    </form>
  );
}
