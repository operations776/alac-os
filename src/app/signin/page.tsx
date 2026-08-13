import { redirect } from "next/navigation";
import { currentSession } from "@/lib/server/auth";
import { brand } from "@/config/brand";
import { SignInForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * The sign in screen sets the tone for the product: an instrument panel
 * waiting for an operator, not a marketing page. It states what the system
 * holds and makes no promise the app does not keep.
 */
export default async function SignInPage() {
  // Already signed in: no reason to show the form again.
  if (await currentSession()) redirect("/dashboard");

  return (
    <main className="graticule flex min-h-dvh items-center justify-center bg-[var(--bg)] px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="placard grid h-9 w-9 shrink-0 place-items-center rounded-[6px] border text-[12px] leading-none text-[var(--brand)]"
            style={{ background: "var(--brand-soft)", borderColor: "var(--brand-line)" }}
            aria-hidden="true"
          >
            {brand.shortName.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-[-0.01em]">{brand.name}</div>
            <div className="placard mt-0.5 text-[9.5px] text-[var(--ink-3)]">
              BD intelligence layer
            </div>
          </div>
        </div>

        <SignInForm />

        <p className="mt-5 text-[12px] leading-relaxed text-[var(--ink-3)]">
          {brand.tagline} Access is per operator and every session is recorded against it.
        </p>
      </div>
    </main>
  );
}
