"use client";

import { useActionState, useState } from "react";
import { Upload, UserPlus } from "lucide-react";
import { addPerson, importPeople, type PeopleState } from "./actions";
import { Card } from "@/components/ui/primitives";

/**
 * Add to the network: one person, or a file of them.
 *
 * Both report honest counts, including what was skipped and which companies
 * did not match an account. An import that says "412 imported" while silently
 * dropping 30 nameless rows is the silent partial success this codebase
 * treats as a bug.
 */
export function AddToNetwork() {
  const [tab, setTab] = useState<"one" | "csv">("csv");
  return (
    <Card className="px-5 py-5">
      <div className="mb-4 flex items-center gap-2">
        {(["csv", "one"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "true" : undefined}
            className={`chip transition-colors ${
              tab === t
                ? "bg-[var(--alac-accent)] text-[var(--alac-ground)]"
                : "hover:bg-[var(--alac-surface-2)]"
            }`}
          >
            {t === "csv" ? "Upload a list" : "Add one person"}
          </button>
        ))}
      </div>
      {tab === "csv" ? <CsvForm /> : <OneForm />}
    </Card>
  );
}

function Result({ state }: { state: PeopleState }) {
  if (state.error) {
    return <p className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</p>;
  }
  if (!state.ok) return null;
  return (
    <div className="flex flex-col gap-1 text-[12.5px]">
      <p className="text-[var(--alac-good)]">
        {state.added} added, {state.updated} updated, {state.matched} matched to a company
        {state.skipped ? `, ${state.skipped} skipped with no name` : ""}.
      </p>
      {state.unmatched && state.unmatched.length > 0 ? (
        <p className="text-[var(--alac-text-3)]">
          Not matched to any company on the list: {state.unmatched.join(", ")}. They are saved and
          will match automatically if that company is added.
        </p>
      ) : null}
    </div>
  );
}

function CsvForm() {
  const [state, action, pending] = useActionState(importPeople, {} as PeopleState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
        CSV file
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="field file:mr-3 file:rounded-[var(--alac-radius-sm)] file:border-0 file:bg-[var(--alac-surface-2)] file:px-3 file:py-1.5 file:text-[var(--alac-text-2)]"
        />
      </label>
      <p className="text-[12px] leading-snug text-[var(--alac-text-3)]">
        A LinkedIn connections export works as it downloads, including its Notes preamble. Any sheet
        with name, title and company works too. Columns for LinkedIn URL, email and about are picked
        up when present. Existing people are updated rather than duplicated.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          <Upload size={16} strokeWidth={1.5} />
          {pending ? "Importing" : "Import"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

function OneForm() {
  const [state, action, pending] = useActionState(addPerson, {} as PeopleState);
  const field = (label: string, name: string, placeholder?: string, required?: boolean) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
      {label}
      <input name={name} placeholder={placeholder} required={required} maxLength={200} className="field" />
    </label>
  );
  return (
    <form key={state.added ?? 0} action={action} className="flex flex-col gap-3">
      {field("Name", "full_name", undefined, true)}
      {field("Title", "title", "VP Engineering")}
      {field("Company", "company", "Matched to the account list automatically")}
      {field("LinkedIn URL", "linkedin_url")}
      {field("Email", "email")}
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
        How you know them
        <textarea name="notes" rows={2} maxLength={1000} className="field resize-y" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          <UserPlus size={16} strokeWidth={1.5} />
          {pending ? "Adding" : "Add to network"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
