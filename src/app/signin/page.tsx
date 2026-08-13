import { redirect } from "next/navigation";
import { currentSession } from "@/lib/server/auth";
import { brand } from "@/config/brand";
import { SignInForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Already signed in: no reason to show the form again.
  if (await currentSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-2)] px-5">
      <div className="w-full max-w-[360px]">
        <div className="mb-6">
          <div className="text-[15px] font-bold tracking-[-0.01em]">{brand.name}</div>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            Sign in to the BD intelligence layer.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
