"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// The owner's list. Accept or decline what the ranking recommends, and ask
// for a company to be pulled on the next refresh. Membership is a pin, so
// these write the same columns the pin dialog writes; the ranking is never
// touched and keeps recommending on its own schedule.

const UUID = /^[0-9a-f-]{36}$/i;

async function own(orgId: string, id: string) {
  if (!UUID.test(id)) return null;
  const rows = (await sql`
    select work_band from tam_accounts where org_id = ${orgId} and id = ${id} limit 1
  `) as { work_band: string | null }[];
  return rows[0] ?? null;
}

function revalidate(id: string) {
  revalidatePath("/command");
  revalidatePath("/queue");
  revalidatePath("/targets");
  revalidatePath(`/queue/${id}`);
}

/** Put the company where the ranking suggested. */
export async function acceptRecommendation(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("accountId") ?? "");
  const a = await own(orgId, id);
  if (!a || !a.work_band || !["now", "next"].includes(a.work_band)) return;

  await sql`
    update tam_accounts
       set pinned_band = ${a.work_band}, pinned_rank = null,
           pin_reason = 'Accepted the recommendation', pin_expires = null,
           pinned_at = now(), pinned_by = 'owner', updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidate(id);
}

/**
 * Keep it off the list. Recorded as a bench pin, so the view stops
 * recommending it until the ranking changes its mind for a new reason.
 */
export async function declineRecommendation(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("accountId") ?? "");
  if (!(await own(orgId, id))) return;

  await sql`
    update tam_accounts
       set pinned_band = 'bench', pinned_rank = null,
           pin_reason = 'Declined the recommendation', pin_expires = null,
           pinned_at = now(), pinned_by = 'owner', updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidate(id);
}

/** Take a company off the working list without a state change. */
export async function removeFromList(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("accountId") ?? "");
  if (!(await own(orgId, id))) return;

  await sql`
    update tam_accounts
       set pinned_band = 'bench', pinned_rank = null,
           pin_reason = 'Removed from the list', pin_expires = null,
           pinned_at = now(), pinned_by = 'owner', updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidate(id);
}

/**
 * Ask for this company on the next pull, whatever band it is in.
 *
 * The pull is a scheduled job with the provider keys; the app never calls
 * the provider at request time. So this cannot fetch anything now, and it
 * does not pretend to: it flags the account and the screen says when.
 */
export async function requestEnrichment(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const id = String(formData.get("accountId") ?? "");
  if (!(await own(orgId, id))) return;

  await sql`
    update tam_accounts set enrich_requested_at = now(), updated_at = now()
     where org_id = ${orgId} and id = ${id}
  `;
  revalidate(id);
}
