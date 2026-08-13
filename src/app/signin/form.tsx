"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full rounded-md bg-[var(--brand)] px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, { error: null });

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[12.5px] font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--brand)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[12.5px] font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--brand)]"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
