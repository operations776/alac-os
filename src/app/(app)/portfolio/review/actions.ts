"use server";

import { revalidatePath } from "next/cache";
import { currentSession } from "@/lib/server/auth";
import {
  approveRecommendation,
  rejectRecommendation,
} from "@/lib/server/queries/recommendations";

/**
 * Both the org and the actor come from the verified session, never from the
 * form. A recommendation id in a hidden field is client-supplied, so every
 * query is scoped by the session's org and a mismatched id matches no row.
 */
export async function approve(formData: FormData) {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing recommendation" };

  const done = await approveRecommendation(session.orgId, id, session.userId);
  revalidatePath("/portfolio/review");
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return done
    ? { ok: true }
    : { ok: false, error: "Already resolved by someone else" };
}

export async function reject(formData: FormData) {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing recommendation" };

  const raw = String(formData.get("note") ?? "").trim();
  const note = raw.length ? raw.slice(0, 2000) : null;

  const done = await rejectRecommendation(session.orgId, id, session.userId, note);
  revalidatePath("/portfolio/review");
  revalidatePath("/dashboard");
  return done
    ? { ok: true }
    : { ok: false, error: "Already resolved by someone else" };
}
