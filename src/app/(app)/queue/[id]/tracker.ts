"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";

// The tracker actions. Everything here records what a human did; nothing
// here sends anything. Every id from a form is checked against the caller's
// org before it is written, which is the tenant rule.

const UUID = /^[0-9a-f-]{36}$/i;

async function ownAccount(orgId: string, accountId: string) {
  if (!UUID.test(accountId)) return false;
  const rows = (await sql`
    select 1 from tam_accounts where org_id = ${orgId} and id = ${accountId} limit 1
  `) as unknown[];
  return rows.length > 0;
}

export type ActionState = { ok: boolean; error?: string | null; n?: number };

/** Append a note: who he spoke to, what was said, what to do next. */
export async function addNote(prev: ActionState, formData: FormData): Promise<ActionState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };
  const accountId = String(formData.get("accountId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return { ok: false, error: "Write something first" };
  if (!(await ownAccount(orgId, accountId))) return { ok: false, error: "Not found" };

  await sql`insert into account_notes (org_id, account_id, body) values (${orgId}, ${accountId}, ${body})`;
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/command");
  return { ok: true, n: (prev.n ?? 0) + 1 };
}

/**
 * Toggle a mark: a checklist item done by hand, a role already mentioned.
 * Plain form action, so it works from a server component with no client code.
 */
export async function setMark(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const accountId = String(formData.get("accountId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const ref = String(formData.get("ref") ?? "").slice(0, 120);
  const done = String(formData.get("done") ?? "1") === "1";
  if (!["check", "role"].includes(kind) || !ref) return;
  if (!(await ownAccount(orgId, accountId))) return;

  await sql`
    insert into desk_marks (org_id, account_id, kind, ref, done)
    values (${orgId}, ${accountId}, ${kind}, ${ref}, ${done})
    on conflict (org_id, account_id, kind, ref)
    do update set done = excluded.done, updated_at = now()
  `;
  revalidatePath(`/queue/${accountId}`);
}

/**
 * Save a message to a named person, and optionally record that it was sent.
 *
 * Keyed on account, person and channel, so editing replaces rather than
 * duplicates. The person does not have to be a sourced target or a first
 * degree connection: a name is enough, because the operator may be writing
 * to someone the desk never found.
 */
export async function saveMessage(prev: ActionState, formData: FormData): Promise<ActionState> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in" };
  const accountId = String(formData.get("accountId") ?? "");
  const person = String(formData.get("person") ?? "").trim().slice(0, 160);
  const channel = String(formData.get("channel") ?? "linkedin") === "email" ? "email" : "linkedin";
  const body = String(formData.get("body") ?? "").trim().slice(0, 6000);
  const sent = String(formData.get("sent") ?? "0") === "1";
  if (!person) return { ok: false, error: "Who is it to?" };
  if (!body) return { ok: false, error: "Write the message first" };
  if (!(await ownAccount(orgId, accountId))) return { ok: false, error: "Not found" };

  await sql`
    insert into outreach_drafts (org_id, account_id, person_name, channel, body, custom, sent_at)
    values (${orgId}, ${accountId}, ${person}, ${channel}, ${body}, true,
            ${sent ? new Date().toISOString() : null})
    on conflict (org_id, account_id, person_name, channel)
    do update set body = excluded.body, custom = true,
                  sent_at = coalesce(excluded.sent_at, outreach_drafts.sent_at)
  `;
  revalidatePath(`/queue/${accountId}`);
  revalidatePath("/command");
  revalidatePath("/targets");
  return { ok: true, n: (prev.n ?? 0) + 1 };
}

/** Record that an existing draft was sent, by a human, outside this app. */
export async function markSent(formData: FormData): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;
  const draftId = String(formData.get("draftId") ?? "");
  if (!UUID.test(draftId)) return;
  const rows = (await sql`
    update outreach_drafts set sent_at = coalesce(sent_at, now())
     where org_id = ${orgId} and id = ${draftId}
     returning account_id
  `) as { account_id: string }[];
  if (rows[0]) {
    revalidatePath(`/queue/${rows[0].account_id}`);
    revalidatePath("/command");
  }
}
