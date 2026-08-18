"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/primitives";
import { signInAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
      {pending ? "Authenticating" : "Authenticate"}
    </Button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, { error: null });

  return (
    <form action={action} className="panel p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="placard text-[9.5px] text-[var(--ink-3)]">
            Operator
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className="field"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="placard text-[9.5px] text-[var(--ink-3)]">
            Passphrase
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field"
          />
        </div>

        {state.error ? (
          <p role="alert" className="placard text-[10px] leading-relaxed text-[var(--bad)]">
            {state.error}
          </p>
        ) : null}

        <Submit />
      </div>
    </form>
  );
}
