import { redirect } from "next/navigation";
import { currentSession } from "@/lib/server/auth";
import { brand } from "@/config/brand";
import { SignInForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * The sign in screen sets the tone for the product. It is the one place that
 * gets the full atmospheric treatment: two organic blur shapes behind a single
 * tonal card, which is the style at its most expressive. It states what the
 * system holds and makes no promise the app does not keep.
 */
export default async function SignInPage() {
  // Already signed in: no reason to show the form again.
  if (await currentSession()) redirect("/dashboard");

  return (
    <main className="surface-wash relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      {/* Decorative only. Positioned partly off canvas so the shapes read as
          colour bleeding in from outside the frame. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="blob left-[-10%] top-[-15%] h-[460px] w-[460px] bg-[var(--md-primary)] opacity-[0.22]" />
        <div className="blob bottom-[-20%] right-[-10%] h-[400px] w-[400px] bg-[var(--md-tertiary)] opacity-[0.18]" />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-7 flex items-center gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-primary)] text-[17px] font-medium leading-none text-[var(--md-on-primary)] shadow-[var(--md-elev-2)]"
            aria-hidden="true"
          >
            {brand.shortName.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="display text-[26px] leading-tight text-[var(--md-on-surface)]">
              {brand.name}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--md-on-surface-muted)]">
              BD intelligence layer
            </div>
          </div>
        </div>

        <SignInForm />

        <p className="mt-6 text-[13px] leading-relaxed text-[var(--md-on-surface-muted)]">
          {brand.tagline} Access is per operator
          and every session is recorded against it.
        </p>
      </div>
    </main>
  );
}
