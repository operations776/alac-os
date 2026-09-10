"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// Dismiss and restore. Nothing is deleted, ever.
//
// A dismissed thing keeps its row, its score and its arithmetic. It stops
// appearing on the boards, it is listed on the page it came from behind a
// "dismissed" filter, and one click puts it back. That is the difference
// between an operator's judgement and data loss.

const UUID = /^[0-9a-f-]{36}$/i;
const KINDS = new Set(["signal", "role"]);

function revalidateAll(kind: string) {
  revalidatePath("/command");
  revalidatePath(kind === "signal" ? "/signals" : "/roles");
  revalidatePath("/queue", "layout");
}

/**
 * Take something off the boards, with a reason.
 *
 * The reason is the point: a dismissal without one is indistinguishable
 * from a mistake six weeks later, and the dismissed list has to be readable
 * by whoever did not do the dismissing.
 */
export async function dismiss(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;

  const kind = String(formData.get("kind") ?? "");
  const refId = String(formData.get("refId") ?? "");
  if (!KINDS.has(kind) || !UUID.test(refId)) return;

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 120) || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  await sql`
    insert into dismissals (org_id, kind, ref_id, reason, note)
    values (${orgId}, ${kind}, ${refId}, ${reason}, ${note})
    on conflict (org_id, kind, ref_id)
    do update set reason = excluded.reason, note = excluded.note, dismissed_at = now()
  `;
  revalidateAll(kind);
}

/** Put it back on the boards, exactly as it was. */
export async function restore(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;

  const kind = String(formData.get("kind") ?? "");
  const refId = String(formData.get("refId") ?? "");
  if (!KINDS.has(kind) || !UUID.test(refId)) return;

  await sql`
    delete from dismissals
     where org_id = ${orgId} and kind = ${kind} and ref_id = ${refId}
  `;
  revalidateAll(kind);
}
