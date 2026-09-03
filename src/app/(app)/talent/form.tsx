"use client";

import { useActionState, useState } from "react";
import { Wand2 } from "lucide-react";
import { addCandidate } from "./actions";
import { parseProfile } from "@/lib/scoring/parse-cv.mjs";

/**
 * Paste a CV or a job description and the fields fill themselves.
 *
 * The parse runs in the browser, deterministically, so it is instant and free
 * and the operator sees exactly which fields were read from the text and which
 * were not. Nothing is invented: a field the parser cannot find is left empty
 * rather than guessed, and everything it does fill stays editable, because the
 * brief asks for owner refinement whatever the classifier decided.
 */
const LABELS: Record<string, string> = {
  full_name: "name",
  title: "title",
  email: "email",
  linkedin_url: "LinkedIn",
  geography: "location",
  clearance: "clearance",
  domains: "domains",
  comp_target: "compensation",
};

type Parsed = ReturnType<typeof parseProfile>;

export function AnalyzeCandidateForm() {
  const [state, action, pending] = useActionState(addCandidate, { error: null });
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);

  function extract() {
    if (!text.trim()) return;
    setParsed(parseProfile(text) as Parsed);
  }

  const field = (
    label: string,
    name: string,
    value: string | null | undefined,
    placeholder?: string,
    required?: boolean,
  ) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
      <span className="flex items-center gap-2">
        {label}
        {parsed && value ? (
          <span className="chip bg-[var(--alac-good-soft)] text-[var(--alac-good)]">read from the text</span>
        ) : null}
      </span>
      <input
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        required={required}
        maxLength={300}
        className="field"
      />
    </label>
  );

  const missing = parsed
    ? Object.keys(LABELS).filter((k) => !parsed.found.includes(k)).map((k) => LABELS[k])
    : [];

  return (
    <form
      // Remounts the inputs when a new parse lands, so extracted values
      // actually replace whatever was in the boxes.
      key={parsed ? parsed.found.join("-") : "blank"}
      action={action}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
        Paste a CV, a LinkedIn profile, or a job description
        <textarea
          name="summary"
          rows={7}
          maxLength={40000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the whole thing. Clearance, domains, title and location are read out of it."
          className="field resize-y"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={extract}
          disabled={!text.trim()}
          className="btn btn-secondary disabled:opacity-50"
        >
          <Wand2 size={16} strokeWidth={1.5} />
          Read the fields from this
        </button>
        {parsed ? (
          <span className="text-[12.5px] text-[var(--alac-text-3)]">
            Found {parsed.found.length} of {Object.keys(LABELS).length}
            {missing.length ? `, missing ${missing.join(", ")}` : ""}
          </span>
        ) : null}
      </div>

      {field("Name", "name", parsed?.full_name, undefined, true)}
      {field("Current title", "title", parsed?.title, "Director of Business Development")}
      {field("Current company", "company", null)}
      {field("Where they will work", "geography", parsed?.geography, "DMV, or remote plus travel")}
      {field("Clearance", "clearance", parsed?.clearance, "Read from the text when present")}
      {field("Domains", "domains", parsed?.domains, "UAS, Navy, autonomy")}
      {field("LinkedIn", "linkedin", parsed?.linkedin_url)}
      {field("Target compensation", "comp", parsed?.comp_target)}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Analyzing" : "Analyze and search demand"}
        </button>
        {state.error ? (
          <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
