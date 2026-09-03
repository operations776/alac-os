"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// The four fields the brief insists stay separate, section 9: portfolio
// priority, account stage, disposition and approach. Each answers a different
// question and each cascades differently, which is why one dropdown could
// never have carried all four.
//
// Disposition is the one with teeth: Hold keeps monitoring but suppresses the
// working list, and that suppression happens in the board queries rather than
// here, so it cannot be forgotten by a caller.

const UUID = /^[0-9a-f-]{36}$/i;

// Only these columns, only these values. A field name from a form is never
// interpolated into SQL; it selects a branch.
const PREP = new Set(["NOT STARTED", "IN RESEARCH", "READY FOR QC", "APPROVED", "HOLD"]);
const MOTION = new Set(["TBD", "LIVE LEAD", "GENERAL BD", "MPC WEDGE", "NURTURE", "HOLD"]);

export async function setField(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;

  const id = String(formData.get("accountId") ?? "");
  if (!UUID.test(id)) return;
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");

  switch (field) {
    case "prep":
      if (!PREP.has(value)) return;
      await sql`update tam_accounts set prep_status = ${value}::prep_status, updated_at = now()
                 where org_id = ${orgId} and id = ${id}`;
      break;
    case "motion":
      if (!MOTION.has(value)) return;
      await sql`update tam_accounts set recommended_motion = ${value}::recommended_motion, updated_at = now()
                 where org_id = ${orgId} and id = ${id}`;
      break;
    case "next_week":
      await sql`update tam_accounts set next_week = ${value === "1"}, updated_at = now()
                 where org_id = ${orgId} and id = ${id}`;
      break;
    default:
      return;
  }

  revalidatePath("/queue");
  revalidatePath(`/queue/${id}`);
  revalidatePath("/command");
  revalidatePath("/targets");
}
