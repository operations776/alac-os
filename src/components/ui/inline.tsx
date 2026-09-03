"use client";

import { useRef } from "react";
import { setField } from "@/app/(app)/queue/[id]/fields";

/**
 * A dropdown that saves as soon as it changes.
 *
 * Section 15: operational fields are edited in the working view, not on a
 * detail page behind two clicks. There is no Save button because a select
 * with a Save button beside it is two controls doing one job.
 *
 * The form submits on change through a hidden button rather than
 * requestSubmit on the form itself, so the value that reaches the server is
 * the one the user just picked.
 */
export function InlineSelect({
  accountId,
  field,
  value,
  options,
}: {
  accountId: string;
  field: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setField} className="inline-flex">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={value}
        aria-label={field}
        onChange={() => ref.current?.requestSubmit()}
        className="min-h-[28px] rounded-[var(--alac-radius-sm)] border border-transparent bg-transparent px-1.5 text-[12.5px] text-[var(--alac-text-2)] transition-colors hover:border-[var(--alac-line)] hover:bg-[var(--alac-surface-2)] focus:border-[var(--alac-accent)] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--alac-surface)]">
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
