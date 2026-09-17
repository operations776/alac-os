"use server";

import { revalidatePath } from "next/cache";

import { sql, asPerson } from "@/lib/server/db";
import { getOrgId } from "@/lib/server/queries/desk";
import { requirePerson } from "@/lib/server/ops/context";
import { type Result, fail, flushSlack } from "@/lib/server/ops/result";

// PUSH TO THE BOARD.
//
// "Is there a way that we could potentially put, you know, push to live lead
// Kanban or something like that, so I can select, okay, this is the one I
// want to work, and it pushes to a Kanban." Adrian, 10 September.
//
// The desk finds the work and the board tracks it. Until now the two were
// joined by a person retyping a company name, so a lead he picked here had
// to be recreated there before Darwin could research it.
//
// Nothing new was needed to carry this: mc.gtm_accounts already had
// external_id and external_url, and a partial unique index on external_id.
// So the push is an insert that names where the row came from, and pushing
// the same thing twice updates the card rather than making a second one.
// That index is the race guard, which is why this never reads before writing.
//
// A company pushed from its own page goes through startGtm in
// queue/[id]/gtm.ts and is keyed on the TAM Record ID. This file deliberately
// does not offer a second way to push a company: two keys for one company
// would put two cards on the board and neither would look wrong.

type Id = { id: string };

/** The desk's name for a thing, as one stable key the board can be matched on. */
function externalId(kind: "role" | "candidate", id: string) {
  return `alac:${kind}:${id}`;
}

/**
 * Put one requisition on the GTM board as a live lead to research.
 *
 * The role is the unit of work here, not the company: Adrian picks the
 * requisition he wants worked, and the card names it so Darwin knows which
 * one. A company with three aged roles can be three separate leads.
 */
export async function pushToBoard(input: {
  accountId: string;
  roleId: string;
}): Promise<Result<{ id: string; already: boolean }>> {
  try {
    const { me } = await requirePerson("member");
    const orgId = await getOrgId();
    if (!orgId) return { ok: false, error: "Not signed in" };

    // Read the desk's own row first, and scope it to the caller's org: the
    // ids arrive from a form, so neither is trusted as a lookup key alone.
    const [account] = (await sql`
      select a.id, a.company_name, a.domain,
             (select h.what_happened from heat_signals h
               where h.account_id = a.id
               order by h.signal_date desc nulls last limit 1) as why_now
        from tam_accounts a
       where a.org_id = ${orgId} and a.id = ${input.accountId}
    `) as { id: string; company_name: string; domain: string | null; why_now: string | null }[];
    if (!account) return { ok: false, error: "That company is not on your desk." };

    type Role = { id: string; title: string; url: string | null; relevance: number | null; age: number | null };
    const [role] = (await sql`
      select r.id, r.title, r.url, r.relevance,
             (current_date - coalesce(r.first_seen, r.posted_at)) as age
        from account_roles r
       where r.org_id = ${orgId} and r.id = ${input.roleId} and r.account_id = ${account.id}
    `) as Role[];
    if (!role) return { ok: false, error: "That role is not on your desk." };

    const key = externalId("role", role.id);
    const website = account.domain ? `https://${account.domain.replace(/^https?:\/\//, "")}` : null;
    // Why this is worth working, in the words the board shows. The age is the
    // whole argument for an aged requisition, so it is said plainly.
    const why = [
      `Open role: ${role.title}`,
      role.age != null ? `open ${role.age} days` : null,
      role.relevance != null ? `scores ${role.relevance}/100` : null,
      account.why_now,
    ].filter(Boolean).join(", ");

    const [row] = await asPerson(me.id, (q) => q<Id & { already: boolean }>(
      `insert into mc.gtm_accounts
         (company, website, owner_id, stage, signal_source, signal_note,
          why_now, external_id, external_url, created_by)
       values ($1, $2, $3, 'target', 'ALAC OS', $4, $4, $5, $6, $3)
       on conflict (external_id) where external_id is not null
       do update set
         -- Pushing again refreshes the reason and re-surfaces the card, but
         -- never drags it backwards through a stage somebody has moved it to.
         why_now = excluded.why_now,
         signal_note = excluded.signal_note,
         website = coalesce(mc.gtm_accounts.website, excluded.website)
       returning id, (xmax <> 0) as already`,
      [account.company_name, website, me.id, why, key, role.url ?? website],
    ));

    revalidatePath("/gtm");
    revalidatePath(`/queue/${account.id}`);
    revalidatePath("/roles");
    revalidatePath("/command");
    await flushSlack();
    return { ok: true, data: { id: row.id, already: row.already } };
  } catch (e) { return fail(e); }
}

/**
 * Put a candidate on the board as an MPC to take to market.
 *
 * Same key scheme, so a candidate pushed twice updates one card.
 */
export async function pushCandidateToBoard(candidateId: string): Promise<Result<{ id: string; already: boolean }>> {
  try {
    const { me } = await requirePerson("member");
    const orgId = await getOrgId();
    if (!orgId) return { ok: false, error: "Not signed in" };

    const [c] = (await sql`
      select id, full_name, title, company, mpc_score
        from candidates where org_id = ${orgId} and id = ${candidateId}
    `) as { id: string; full_name: string; title: string | null; company: string | null; mpc_score: number | null }[];
    if (!c) return { ok: false, error: "That candidate is not on your desk." };

    const why = [
      c.title ?? "Candidate to market",
      c.company ? `currently at ${c.company}` : null,
      c.mpc_score != null ? `MPC ${c.mpc_score}/100` : null,
    ].filter(Boolean).join(", ");

    const [row] = await asPerson(me.id, (q) => q<Id & { already: boolean }>(
      `insert into mc.gtm_accounts
         (company, owner_id, stage, signal_source, signal_note, why_now,
          external_id, created_by)
       values ($1, $2, 'target', 'ALAC OS MPC', $3, $3, $4, $2)
       on conflict (external_id) where external_id is not null
       do update set why_now = excluded.why_now, signal_note = excluded.signal_note
       returning id, (xmax <> 0) as already`,
      [`MPC: ${c.full_name}`, me.id, why, externalId("candidate", c.id)],
    ));

    revalidatePath("/gtm");
    revalidatePath(`/talent/${c.id}`);
    await flushSlack();
    return { ok: true, data: { id: row.id, already: row.already } };
  } catch (e) { return fail(e); }
}
