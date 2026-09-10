"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/server/queries/desk";
import { verifyRoles } from "@/lib/server/roles/verify";

export type CheckState = {
  ok?: boolean;
  message?: string | null;
  error?: string | null;
};

/**
 * Check now, from the page.
 *
 * The same check the nightly cron runs, on demand, so a suspect link can be
 * settled while he is looking at it rather than tomorrow. Capped at sixty
 * pages so the request finishes: the cron does the rest.
 */
export async function checkRolesNow(): Promise<CheckState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  try {
    const r = await verifyRoles(orgId, { limit: 60 });
    revalidatePath("/roles");
    revalidatePath("/command");
    if (r.checked === 0) {
      return { ok: true, message: "Everything on screen was checked in the last three days." };
    }
    // Honest counts, including what could not be reached. An unreachable
    // page is not evidence the role is gone.
    const parts = [`${r.checked} checked`, `${r.live} still open`];
    if (r.gone > 0) parts.push(`${r.gone} closed and removed`);
    if (r.unknown > 0) parts.push(`${r.unknown} unreachable, left as they were`);
    return { ok: true, message: parts.join(", ") + "." };
  } catch (err) {
    console.error("[checkRolesNow]", err);
    return { ok: false, error: "The check could not finish. Nothing was changed." };
  }
}
