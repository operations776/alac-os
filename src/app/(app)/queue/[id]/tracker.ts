"use server";

import { revalidatePath } from "next/cache";
import { sql, tx } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { currentSession } from "@/lib/server/auth";
import { reasoningStatus } from "@/lib/server/ai/openai";
import { writeFirstMessage } from "@/lib/server/ai/outreach.mjs";
import { buildOutreachContext } from "@/lib/server/ai/outreach-context.mjs";

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

export type DraftState = {
  ok: boolean;
  error?: string | null;
  body?: string;
  /** True when the stored row was written by the model and is still untouched. */
  ai?: boolean;
  note?: string | null;
};

/**
 * The first message, drafted and saved when the dialog opens with nothing in it.
 *
 * Never regenerates over a stored row: a saved or sent message is returned as
 * it is. Only a person the desk actually holds (a sourced target or a warm
 * contact) gets a draft, because the writer may only use recorded facts.
 */
export async function autoDraftMessage(accountId: string, person: string, channel: string): Promise<DraftState> {
  return draftMessage(accountId, person, channel, false);
}

/**
 * Write the message again. Overwrites only a row the model wrote, that nobody
 * has saved over and that has not been sent; anything else is refused before
 * any money is spent, and the update carries the same guard for a save that
 * lands while the model runs.
 */
export async function redraftMessage(accountId: string, person: string, channel: string): Promise<DraftState> {
  return draftMessage(accountId, person, channel, true);
}

type Row = { body: string; custom: boolean; sent_at: string | null };

async function draftMessage(accountId: string, rawPerson: string, rawChannel: string, redraft: boolean): Promise<DraftState> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Not signed in" };
  const orgId = session.orgId;
  const person = String(rawPerson ?? "").trim().slice(0, 160);
  const channel = rawChannel === "email" ? "email" : "linkedin";
  if (!person || !UUID.test(accountId)) return { ok: false, error: "Not found" };

  const [account] = (await sql`
    select id, company_name, domain, employee_count
      from tam_accounts where org_id = ${orgId} and id = ${accountId}
  `) as { id: string; company_name: string; domain: string | null; employee_count: number | null }[];
  if (!account) return { ok: false, error: "Not found" };

  const readStored = async () =>
    ((await sql`
      select body, custom, sent_at from outreach_drafts
       where org_id = ${orgId} and account_id = ${accountId} and person_name = ${person} and channel = ${channel}
    `) as Row[])[0];
  const stored = await readStored();
  if (stored && !redraft) return { ok: true, body: stored.body, ai: !stored.custom };
  if (stored?.sent_at) return { ok: false, error: "Already sent, so it is not redrafted" };
  if (stored?.custom) return { ok: false, error: "You saved this message yourself, so it is not redrafted" };

  const status = reasoningStatus();
  if (!status.available) return { ok: false, error: `AI drafting is off: ${status.reason}` };

  const ctx = await buildOutreachContext(
    (text: string, params: unknown[]) => sql.query(text, params) as Promise<unknown[]>,
    orgId,
    account,
    person,
  );
  // Exact name only: the dialog passes the name it shows, and a partial match
  // would draft to a different person under this one's name.
  if (!ctx.person || ctx.person.full_name.toLowerCase() !== person.toLowerCase()) {
    return { ok: false, error: `No recorded contact named ${person} at this company, so there is nothing grounded to draft from` };
  }

  // Claim before side effects: the run row exists before the paid call.
  const [run] = (await sql`
    insert into agent_runs (org_id, kind, status, trigger, triggered_by, params, model, items_total, started_at)
    values (${orgId}, 'draft_message', 'running', 'api', ${session.userId},
            ${JSON.stringify({ feature: "desk_message", account_id: accountId, person, channel, redraft })}::jsonb,
            ${status.model}, 1, now())
    returning id
  `) as { id: string }[];

  const closeRun = (c: { query: (t: string, p: unknown[]) => Promise<unknown> }, ok: boolean, cost: number, error: string | null) =>
    c.query(
      `update agent_runs set status = $2::agent_run_status, items_ok = $3, items_failed = $4, cost_usd = $5,
              error = $6, finished_at = now(), duration_ms = (extract(epoch from now() - started_at) * 1000)::int
        where id = $1`,
      [run.id, ok ? "complete" : "failed", ok ? 1 : 0, ok ? 0 : 1, cost, error?.slice(0, 2000) ?? null],
    );

  let out: Awaited<ReturnType<typeof writeFirstMessage>>;
  try {
    // The .mjs signature is inferred from its defaults (never[], null), so the
    // input is cast; buildOutreachContext is the one place that shapes it.
    out = await writeFirstMessage(ctx.input as never);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await closeRun(sql, false, 0, msg).catch(() => {});
    return { ok: false, error: `Drafting failed: ${msg.slice(0, 200)}` };
  }
  const cost = out.cost ?? 0;
  if (!out.message) {
    await closeRun(sql, false, cost, out.rejected ?? "rejected").catch(() => {});
    return { ok: false, error: `The draft was rejected: ${out.rejected}` };
  }

  const m = out.message;
  const values = [
    orgId, accountId, ctx.person.id, person, channel, m.message, m.opening_line, m.why_this_angle,
    JSON.stringify(m.facts_used ?? []), JSON.stringify(out.sources ?? []), out.model,
  ];
  // Data law 2: a person who saved meanwhile, or a concurrent click, keeps
  // their row. The draft and the run close commit together.
  const saved = await tx(async (c) => {
    const { rows } = redraft
      ? await c.query<{ body: string }>(
          `update outreach_drafts
              set target_id = $3, body = $6, opening_line = $7, why_this_angle = $8, facts_used = $9::jsonb,
                  sources = $10::jsonb, model = $11, drafted_at = now(), approved = false
            where org_id = $1 and account_id = $2 and person_name = $4 and channel = $5
              and custom = false and sent_at is null
           returning body`,
          values,
        )
      : { rows: [] as { body: string }[] };
    const inserted = rows.length
      ? rows
      : (
          await c.query<{ body: string }>(
            `insert into outreach_drafts (org_id, account_id, target_id, person_name, channel, body,
               opening_line, why_this_angle, facts_used, sources, model, custom)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, false)
             on conflict (org_id, account_id, person_name, channel) do nothing
             returning body`,
            values,
          )
        ).rows;
    await closeRun(c, true, cost, null);
    return inserted[0] ?? null;
  });

  const note = channel === "email" ? "The writer does not produce a subject line, so add one before sending." : null;
  if (saved) return { ok: true, body: saved.body, ai: true, note };
  // Lost the race: whatever is stored now wins over the fresh draft.
  const now = await readStored();
  return now
    ? { ok: true, body: now.body, ai: !now.custom, note: "Kept the message saved meanwhile instead of the new draft." }
    : { ok: false, error: "The draft could not be saved" };
}
