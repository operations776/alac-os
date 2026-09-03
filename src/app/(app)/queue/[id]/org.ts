"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// Organization penetration, SourceWhale status and disposition. All three
// record a human act, so all three are set by hand and none is inferred.

const UUID = /^[0-9a-f-]{36}$/i;
const LANES = new Set(["executive", "functional", "hiring_leader", "hiring_manager", "talent", "connector"]);
const STATUS = new Set(["Untouched", "Attempted", "Engaged", "Closed", "Available", "Asked", "Introduced", "Declined"]);
const SW = new Set(["Not Added", "Added", "Active Campaign", "Paused", "Replied", "Positive Reply", "Completed"]);
const DISPOSITION = new Set(["Active", "Hold", "Nurture", "Disqualified", "Archived"]);

/** Record that a level of the organization was approached, and what happened. */
export async function setTouch(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const accountId = String(formData.get("accountId") ?? "");
  const lane = String(formData.get("lane") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(accountId) || !LANES.has(lane) || !STATUS.has(status)) return;

  const person = String(formData.get("person") ?? "").trim().slice(0, 200) || null;
  const channel = String(formData.get("channel") ?? "").trim().slice(0, 60) || null;
  const outcome = String(formData.get("outcome") ?? "").trim().slice(0, 300) || null;

  await sql`
    insert into org_touches (org_id, account_id, lane, status, person, channel, outcome, touched_at)
    values (${orgId}, ${accountId}, ${lane}, ${status}, ${person}, ${channel}, ${outcome},
            ${status === "Untouched" ? null : new Date().toISOString().slice(0, 10)})
    on conflict (org_id, account_id, lane) do update set
      status = excluded.status,
      person = coalesce(excluded.person, org_touches.person),
      channel = coalesce(excluded.channel, org_touches.channel),
      outcome = coalesce(excluded.outcome, org_touches.outcome),
      touched_at = coalesce(excluded.touched_at, org_touches.touched_at),
      updated_at = now()
  `;
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/command");
}

/**
 * SourceWhale status, by hand.
 *
 * Section 32 allows this explicitly: manual until a supported integration
 * exists. The API will write the same columns, so nothing here is thrown away
 * when the key arrives.
 */
export async function setSourceWhale(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const accountId = String(formData.get("accountId") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!UUID.test(accountId) || !SW.has(state)) return;

  const campaign = String(formData.get("campaign") ?? "").trim().slice(0, 200) || null;
  const contactsRaw = String(formData.get("contacts") ?? "").trim();
  const contacts = contactsRaw ? Math.max(0, Math.min(9999, Number(contactsRaw) || 0)) : null;

  await sql`
    update tam_accounts
       set sw_state = ${state},
           sw_campaign = coalesce(${campaign}, sw_campaign),
           sw_contacts = coalesce(${contacts}, sw_contacts),
           sw_last_activity = case when ${state} = 'Not Added' then null else current_date end,
           updated_at = now()
     where org_id = ${orgId} and id = ${accountId}
  `;
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/queue");
  revalidatePath("/command");
}

/**
 * Change the disposition. Section 15.1: never hard delete, always ask which
 * kind of stop this is, because each one cascades differently. Hold and
 * Nurture keep monitoring; Disqualified and Archived suppress active work.
 */
export async function setDisposition(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const accountId = String(formData.get("accountId") ?? "");
  const disposition = String(formData.get("disposition") ?? "");
  if (!UUID.test(accountId) || !DISPOSITION.has(disposition)) return;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;

  await sql`
    update tam_accounts
       set disposition = ${disposition},
           disposition_reason = ${reason},
           disposition_at = now(),
           updated_at = now()
     where org_id = ${orgId} and id = ${accountId}
  `;
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/queue");
  revalidatePath("/command");
  revalidatePath("/targets");
}
