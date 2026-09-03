"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// Owner override. Section 8: the owner's decision is authoritative until it is
// released or expires, and the system rank stays visible beside it.
//
// Nothing here touches work_band. The refresh keeps computing what it thinks;
// the pin sits on top. That separation is what lets the screen show both.

const UUID = /^[0-9a-f-]{36}$/i;
const BANDS = new Set(["now", "next", "bench"]);

export type PinState = { ok: boolean; error?: string | null };

export async function pinAccount(prev: PinState, formData: FormData): Promise<PinState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };

  const accountId = String(formData.get("accountId") ?? "");
  if (!UUID.test(accountId)) return { ok: false, error: "Bad account" };

  const band = String(formData.get("band") ?? "");
  if (!BANDS.has(band)) return { ok: false, error: "Pick a band" };

  const rankRaw = String(formData.get("rank") ?? "").trim();
  const rank = rankRaw ? Number(rankRaw) : null;
  if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 999)) {
    return { ok: false, error: "Rank is a number from 1 to 999" };
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  const expiresRaw = String(formData.get("expires") ?? "").trim();
  const expires = /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw) ? expiresRaw : null;

  const rows = (await sql`
    update tam_accounts
       set pinned_band = ${band},
           pinned_rank = ${rank},
           pin_reason = ${reason},
           pin_expires = ${expires},
           pinned_at = now(),
           pinned_by = 'owner'
     where org_id = ${orgId} and id = ${accountId}
     returning id
  `) as { id: string }[];
  if (!rows[0]) return { ok: false, error: "Not found" };

  revalidate(accountId);
  return { ok: true };
}

/** Release the override and hand the account back to the ranking. */
export async function releasePin(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const accountId = String(formData.get("accountId") ?? "");
  if (!UUID.test(accountId)) return;

  await sql`
    update tam_accounts
       set pinned_band = null, pinned_rank = null, pin_reason = null,
           pin_expires = null, pinned_at = null, pinned_by = null
     where org_id = ${orgId} and id = ${accountId}
  `;
  revalidate(accountId);
}

function revalidate(accountId: string) {
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/queue");
  revalidatePath("/targets");
  revalidatePath("/command");
}
