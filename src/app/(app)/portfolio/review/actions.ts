"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/server/queries/portfolio";
import {
  approveRecommendation,
  rejectRecommendation,
} from "@/lib/server/queries/recommendations";

/**
 * orgId comes from the server, never from the form. A recommendation id in a
 * hidden field is a client-supplied value, so every query is scoped by the
 * org resolved here and a mismatched id simply matches no row.
 */
export async function approve(formData: FormData) {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "No organization in session" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing recommendation" };

  // Auth lands in ALAC-15. Until then the actor is unattributed rather than
  // faked, which is the honest state: resolved_by stays null.
  const done = await approveRecommendation(orgId, id, null);
  revalidatePath("/portfolio/review");
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return done
    ? { ok: true }
    : { ok: false, error: "Already resolved by someone else" };
}

export async function reject(formData: FormData) {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "No organization in session" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing recommendation" };

  const raw = String(formData.get("note") ?? "").trim();
  const note = raw.length ? raw.slice(0, 2000) : null;

  const done = await rejectRecommendation(orgId, id, null, note);
  revalidatePath("/portfolio/review");
  revalidatePath("/dashboard");
  return done
    ? { ok: true }
    : { ok: false, error: "Already resolved by someone else" };
}
