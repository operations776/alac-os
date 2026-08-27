"use client";

import { useActionState } from "react";
import { addCompany } from "./actions";

export function AddCompanyForm({ name, domain }: { name: string; domain: string }) {
  const [state, action, pending] = useActionState(addCompany, { error: null });
  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--alac-text-2)]">
      {label}
      {input}
      {hint ? <span className="text-[12px] text-[var(--alac-text-3)]">{hint}</span> : null}
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      {field("Company name", <input name="name" required maxLength={200} defaultValue={name} className="field" autoFocus />)}
      {field("Website", <input name="domain" maxLength={200} defaultValue={domain} placeholder="acme.com" className="field" />, "Needed for signals, roles and people. Leave blank if unknown; the next move will say to find it.")}
      {field("Company LinkedIn", <input name="linkedin" maxLength={300} placeholder="https://www.linkedin.com/company/acme" className="field" />)}
      {field("Location", <input name="hq" maxLength={200} placeholder="El Segundo, California" className="field" />)}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding" : "Add to Up next"}
        </button>
        {state.error ? <span className="text-[12.5px] text-[var(--alac-red-text)]">{state.error}</span> : null}
      </div>
    </form>
  );
}
