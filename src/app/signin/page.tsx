import { redirect } from "next/navigation";
import { currentSession } from "@/lib/server/auth";
import { brand } from "@/config/brand";
import { Logo } from "@/components/shell/logo";
import { SignInForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * The sign in screen sets the tone for the product, and it is the one place
 * that gets the marketing site's own hero treatment: the mark, a periwinkle
 * headline over the navy wash, and the tracked mono strap underneath. It
 * states what the system holds and makes no promise the app does not keep.
 */
export default async function SignInPage() {
  // Already signed in: no reason to show the form again. This used to send
  // people to /dashboard, which stopped existing when the desk command center
  // replaced the portfolio model, so signing in landed on a 404.
  if (await currentSession()) redirect("/command");

  return (
    <main className="surface-wash flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px]">
        <Logo height={30} />

        {/* The site's own hero treatment: a periwinkle headline over the navy
            wash, with the tracked mono strap under it. */}
        <h1 className="display-hero mt-9 text-[34px] leading-[1.12] sm:text-[40px]">
          The desk command center
        </h1>
        <p className="prose-measure mt-3 text-[14px] leading-[1.65] text-[var(--alac-text-2)]">
          {brand.tagline}
        </p>

        <div className="mt-8">
          <SignInForm />
        </div>

        <p className="placard mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-[var(--alac-text-3)]">
          <span>Access is per operator</span>
          <span aria-hidden="true" className="text-[var(--alac-line-strong)]">
            |
          </span>
          <span>Every session is recorded</span>
        </p>
      </div>
    </main>
  );
}
