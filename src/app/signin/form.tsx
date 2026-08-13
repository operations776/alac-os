"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "./actions";

const FIELD =
  "rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--brand)]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full rounded-[6px] border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--brand)] transition-colors hover:border-[var(--brand)] disabled:opacity-50"
    >
      {pending ? "Signing in" : "Sign in"}
    </button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, { error: null });

  return (
    <form action={action} className="panel relative overflow-hidden p-5">
      <div className="sweep-line" />
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="placard text-[10px] text-[var(--ink-3)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="placard text-[10px] text-[var(--ink-3)]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={FIELD}
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-[12.5px] text-[var(--bad)]">
            {state.error}
          </p>
        ) : null}

        <Submit />
      </div>
    </form>
  );
}
