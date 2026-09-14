"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { asPerson } from "@/lib/server/db";
import { generateProspectEmails } from "./gtm-emails";
import { requirePerson } from "@/lib/server/ops/context";
import { type Result, wrote, fail, flushSlack, setClause } from "@/lib/server/ops/result";
import { atLeast } from "@/lib/ops/constants";
import type { DraftStatus, GtmStage, Priority } from "@/types/ops";

type Id = { id: string };

/** A capacity refusal from the gate trigger, as the sentence after the code. */
function capacityMessage(e: unknown): string | null {
  const msg = (e as { message?: string } | null)?.message ?? "";
  return /CAPACITY_REACHED/.test(msg) ? msg.replace(/^CAPACITY_REACHED:\s*/, "") : null;
}

// --- GTM -----------------------------------------------------------------------------------

/**
 * Move an account, respecting the stage's capacity.
 *
 * The check lives in the database, so this only has to carry the override
 * flag and turn the refusal into a sentence. Two people both looking at 4/5
 * cannot both take the last slot: the second one's write is the one that
 * fails, which is the point of enforcing it server-side.
 */
export async function moveGtmAccount(
  id: string, stage: GtmStage, opts?: { override?: boolean; reason?: string },
): Promise<Result<{ capacityReached?: boolean; stage?: string }>> {
  try {
    const { me } = await requirePerson("member");

    if (opts?.override && !atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can override capacity." };
    }

    let w: ReturnType<typeof wrote>;
    try {
      w = await asPerson(me.id, async (q) => {
        if (opts?.override) {
          // Session-scoped so the trigger sees it. Reset before commit; if the
          // update throws, the rollback reverts the setting with everything else.
          await q("select mc.set_capacity_override(p_on => true)");
        }

        const hit = await q<Id>(
          "update mc.gtm_accounts set stage = $2 where id = $1 returning id",
          [id, stage],
        );

        if (opts?.override) {
          await q("select mc.set_capacity_override(p_on => false)");
        }

        const res = wrote(hit, "account");
        if (!res.ok) return res;

        // Recorded whether it was a normal release or an override, so throughput
        // is measurable and an override is never invisible.
        await q(
          `insert into mc.gtm_capacity_events (account_id, kind, stage, reason, actor_id)
           values ($1, $2, $3, $4, $5)`,
          [id, opts?.override ? "override" : "released", stage, opts?.reason ?? null, me.id],
        );
        return res;
      });
    } catch (e) {
      const cap = capacityMessage(e);
      if (cap) return { ok: false, error: cap, data: { capacityReached: true, stage } };
      throw e;
    }
    if (!w.ok) return w;

    revalidatePath("/gtm");
    revalidatePath(`/gtm/${id}`);
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Move several accounts to one stage in a single action.
 *
 * Not one bulk UPDATE: the stage capacity gate is enforced per row, and a
 * single statement would either carry the whole set past the cap or fail all
 * of it with one opaque message. So each account is moved in turn and the
 * result says how far it got. Moving four of six and saying so is honest;
 * silently moving none is not. Each move is a savepoint in one transaction, so
 * a refusal undoes only that account and the ones before it still commit.
 */
export async function moveGtmAccounts(
  ids: string[], stage: GtmStage,
): Promise<Result> {
  try {
    if (!ids.length) return { ok: true };
    const { me } = await requirePerson("member");

    const movedIds: string[] = [];
    let stopped = null as string | null;

    await asPerson(me.id, async (q) => {
      for (const id of ids) {
        await q("savepoint move_one");
        try {
          const hit = await q<Id>(
            "update mc.gtm_accounts set stage = $2 where id = $1 returning id",
            [id, stage],
          );
          if (hit.length) {
            await q(
              `insert into mc.gtm_capacity_events (account_id, kind, stage, reason, actor_id)
               values ($1, 'released', $2, null, $3)`,
              [id, stage, me.id],
            );
            movedIds.push(id);
          }
          await q("release savepoint move_one");
        } catch (e) {
          await q("rollback to savepoint move_one");
          stopped = capacityMessage(e) ?? fail(e).error;
          break;
        }
      }
    });

    for (const id of movedIds) revalidatePath(`/gtm/${id}`);
    revalidatePath("/gtm");
    await flushSlack();

    if (stopped) {
      const moved = movedIds.length;
      return {
        ok: false,
        error: moved
          ? `Moved ${moved} of ${ids.length}. The rest stopped: ${stopped}`
          : stopped,
      };
    }
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function createGtmAccount(input: {
  company: string
  website?: string | null
  industry?: string | null
  owner_id?: string | null
  researcher_id?: string | null
  priority?: Priority
  signal_source?: string | null
  signal_note?: string | null
}): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");

    const [row] = await asPerson(me.id, (q) => q<Id>(
      `insert into mc.gtm_accounts
         (company, website, industry, owner_id, researcher_id, priority,
          signal_source, signal_note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        input.company.trim(),
        input.website ?? null,
        input.industry ?? null,
        input.owner_id ?? me.id,
        input.researcher_id ?? null,
        input.priority ?? "normal",
        input.signal_source ?? null,
        input.signal_note ?? null,
        me.id,
      ],
    ));

    revalidatePath("/gtm");
    await flushSlack();
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

const GTM_ACCOUNT_PATCH = [
  "stage", "researcher_id", "owner_id", "priority", "company", "website", "industry",
  "why_now", "signal_note", "signal_source", "notes", "next_action", "next_action_on",
  "external_id", "external_url", "outcome", "outcome_note",
] as const;

export async function updateGtmAccount(
  id: string,
  // Everything a person is responsible for on an account. A field missing
  // here is a field nobody can correct without opening the database, which
  // is how "why now" and the signal details became read-only in practice.
  patch: {
    stage?: GtmStage
    researcher_id?: string | null
    owner_id?: string | null
    priority?: Priority
    company?: string
    website?: string | null
    industry?: string | null
    why_now?: string | null
    signal_note?: string | null
    signal_source?: string | null
    notes?: string | null
    next_action?: string | null
    next_action_on?: string | null
    external_id?: string | null
    external_url?: string | null
    outcome?: string | null
    outcome_note?: string | null
  },
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, GTM_ACCOUNT_PATCH, 2);
    if (set.empty) return { ok: true };
    // Verify the write landed: an UPDATE matching no row is not an error,
    // so without this a deleted row reports success.
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.gtm_accounts set ${set.sql} where id = $1 returning id`,
      [id, ...set.values],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    revalidatePath(`/gtm/${id}`);
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addGtmContact(input: {
  account_id: string
  name: string
  title?: string | null
  linkedin_url?: string | null
  seniority?: number
  /** For a hiring manager: the function they hire for. */
  hiring_for?: string | null
  rationale?: string | null
}): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const [added] = await asPerson(me.id, (q) => q<Id>(
      `insert into mc.gtm_contacts
         (account_id, name, title, linkedin_url, seniority, hiring_for, rationale, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        input.account_id,
        input.name.trim(),
        input.title ?? null,
        input.linkedin_url ?? null,
        input.seniority ?? 3,
        input.hiring_for ?? null,
        input.rationale ?? null,
        me.id,
      ],
    ));
    // Draft the prospect's three emails after the response, so adding a
    // prospect never waits on the model. A failure is logged and the panel's
    // own generate and the manual path still work.
    after(async () => {
      try {
        const r = await generateProspectEmails(input.account_id, added.id);
        if (!r.ok) console.error(`gtm_email: contact ${added.id}: ${r.error}`);
      } catch (e) {
        console.error(`gtm_email: contact ${added.id}:`, e);
      }
    });
    revalidatePath(`/gtm/${input.account_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Confirm an account is loaded into SourceWhale (the load gate).
 *
 * The affirmation is deliberately specific: not "I uploaded it" but "every
 * hiring manager and above is in the sequence". A researcher who stops at
 * the two personas they were targeting has not finished the load, and the
 * campaign that follows quietly skips everyone else.
 */
export async function confirmSourceWhaleLoad(
  accountId: string, note?: string | null,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.gtm_accounts set sw_loaded_by = $2, sw_load_note = $3 where id = $1 returning id",
      [accountId, me.id, note ?? null],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }
    revalidatePath(`/gtm/${accountId}`); revalidatePath("/gtm");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Remove several contacts or drafts at once.
 *
 * Clearing a mis-imported contact list one row at a time is the kind of
 * chore people avoid, so the bad rows stay.
 */
export async function deleteGtmContacts(
  ids: string[], accountId: string,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(
      "delete from mc.gtm_contacts where id = any($1::uuid[])",
      [ids],
    ));
    revalidatePath(`/gtm/${accountId}`); revalidatePath("/gtm");
    return { ok: true, data: { count: ids.length } };
  } catch (e) { return fail(e); }
}

/**
 * Review several drafts at once.
 *
 * A review pass usually covers every draft on an account in one sitting.
 * Approving them one at a time turns a single decision into several clicks,
 * and the last one gets skipped.
 */
export async function reviewOutreachDrafts(
  ids: string[], accountId: string, status: DraftStatus, note?: string,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(
      `update mc.outreach_drafts
          set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
        where id = any($1::uuid[])`,
      [ids, status, me.id, note ?? null],
    ));
    revalidatePath(`/gtm/${accountId}`); revalidatePath("/gtm");
    revalidatePath("/my-work");
    await flushSlack();
    return { ok: true, data: { count: ids.length } };
  } catch (e) { return fail(e); }
}

export async function deleteOutreachDrafts(
  ids: string[], accountId: string,
): Promise<Result<{ count: number }>> {
  try {
    if (!ids.length) return { ok: true, data: { count: 0 } };
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(
      "delete from mc.outreach_drafts where id = any($1::uuid[])",
      [ids],
    ));
    revalidatePath(`/gtm/${accountId}`); revalidatePath("/gtm");
    return { ok: true, data: { count: ids.length } };
  } catch (e) { return fail(e); }
}

/** Withdraw the confirmation: the list turned out to be incomplete. */
export async function retractSourceWhaleLoad(accountId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.gtm_accounts set sw_loaded_by = null where id = $1 returning id",
      [accountId],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }
    revalidatePath(`/gtm/${accountId}`); revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * The draft that holds a prospect's outreach, created on first use.
 *
 * One per contact, so the three variations and the finalized copy have a
 * single home. Returns the existing one rather than adding another, since a
 * second draft for the same person is how copy starts disappearing.
 */
export async function draftForContact(
  accountId: string, contactId: string,
): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");
    const { id, created } = await asPerson(me.id, async (q) => {
      const [existing] = await q<Id>(
        `select id from mc.outreach_drafts where contact_id = $1
          order by updated_at desc limit 1`,
        [contactId],
      );
      if (existing) return { id: existing.id, created: false };
      const [row] = await q<Id>(
        `insert into mc.outreach_drafts (account_id, contact_id, status)
         values ($1, $2, 'draft') returning id`,
        [accountId, contactId],
      );
      return { id: row.id, created: true };
    });
    if (created) revalidatePath(`/gtm/${accountId}`);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

/**
 * Write one of the three drafted options.
 *
 * Keyed on (draft, slot) so editing option two never creates a fourth.
 */
export async function saveVariation(input: {
  draftId: string
  accountId: string
  slot: number
  subject?: string | null
  body?: string | null
}): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(
      `insert into mc.outreach_variations (draft_id, slot, revision, subject, body, created_by)
       values ($1, $2, 1, $3, $4, $5)
       on conflict (draft_id, revision, slot) do update
         set subject = excluded.subject, body = excluded.body, created_by = excluded.created_by`,
      [input.draftId, input.slot, input.subject?.trim() || null, input.body?.trim() || null, me.id],
    ));
    revalidatePath(`/gtm/${input.accountId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Take a variation as the starting point for Final Copy.
 *
 * Copies the text rather than linking to it: from here the two diverge, and
 * a later regeneration of the variations must not rewrite what somebody has
 * already refined.
 */
export async function copyVariationToFinal(
  draftId: string, variationId: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, async (q) => {
      const [v] = await q<{ subject: string | null; body: string | null; ps: string | null }>(
        "select subject, body, ps from mc.outreach_variations where id = $1",
        [variationId],
      );
      if (!v) throw new Error("That variation no longer exists.");
      return q<Id>(
        `update mc.outreach_drafts
            set final_subject = $2, final_body = $3, final_ps = $4, final_from_variation = $5
          where id = $1 returning id`,
        [draftId, v.subject, v.body, v.ps, variationId],
      );
    });
    { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Save a refinement to Final Copy. Editing must be faster than asking. */
export async function saveFinalCopy(
  draftId: string,
  patch: { final_subject?: string | null; final_body?: string | null
           final_ps?: string | null },
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, ["final_subject", "final_body", "final_ps"], 2);
    if (set.empty) return { ok: true };
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.outreach_drafts set ${set.sql} where id = $1 returning id`,
      [draftId, ...set.values],
    ));
    { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Authorise exactly this copy.
 *
 * Approval means "this is the text we are going to send", not "variation two
 * was good", so it refuses when there is nothing in Final Copy to approve.
 */
export async function approveFinalCopy(draftId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    if (!atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can approve outreach." };
    }

    const res = await asPerson(me.id, async (q): Promise<Result> => {
      const [draft] = await q<{ final_body: string | null }>(
        "select final_body from mc.outreach_drafts where id = $1",
        [draftId],
      );
      if (!draft?.final_body?.trim()) {
        return {
          ok: false,
          error: "There is no final copy to approve. Pick a version as the starting point first.",
        };
      }
      const hit = await q<Id>(
        "update mc.outreach_drafts set status = 'approved', approved_by = $2 where id = $1 returning id",
        [draftId, me.id],
      );
      return wrote(hit, "draft");
    });
    if (!res.ok) return res;

    revalidatePath("/gtm"); revalidatePath("/my-work"); revalidatePath("/ops");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Send it back, with the reason attached. */
export async function requestOutreachChanges(
  draftId: string, note: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    if (!note.trim()) {
      return { ok: false, error: "Say what needs to change, so it does not come back the same." };
    }
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.outreach_drafts
          set status = 'needs_revision', review_note = $2, reviewed_by = $3, reviewed_at = now()
        where id = $1 returning id`,
      [draftId, note.trim(), me.id],
    ));
    { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    revalidatePath("/gtm"); revalidatePath("/my-work"); revalidatePath("/ops");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Attach the personalisation research. Any URL: a Doc, a Drive file, a page. */
export async function setResearchUrl(
  draftId: string, url: string | null,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.outreach_drafts set research_url = $2 where id = $1 returning id",
      [draftId, url?.trim() || null],
    ));
    { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteOutreachDraft(
  id: string, accountId: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q("delete from mc.outreach_drafts where id = $1", [id]));
    revalidatePath(`/gtm/${accountId}`);
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateGtmContact(
  id: string,
  accountId: string,
  patch: {
    name?: string
    title?: string | null
    linkedin_url?: string | null
    seniority?: number
    hiring_for?: string | null
    rationale?: string | null
    notes?: string | null
  },
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(
      patch, ["name", "title", "linkedin_url", "seniority", "hiring_for", "rationale", "notes"], 2,
    );
    if (set.empty) return { ok: true };
    // Verify the write landed: an UPDATE matching no row is not an error,
    // so without this a deleted row reports success.
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.gtm_contacts set ${set.sql} where id = $1 returning id`,
      [id, ...set.values],
    ));
    { const w = wrote(hit, "contact"); if (!w.ok) return w; }
    revalidatePath(`/gtm/${accountId}`);
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteGtmContact(id: string, accountId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q("delete from mc.gtm_contacts where id = $1", [id]));
    revalidatePath(`/gtm/${accountId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveOutreachDraft(input: {
  id?: string
  account_id: string
  contact_id?: string | null
  subject?: string | null
  body?: string | null
  personalization?: string | null
  signal?: string | null
  status?: DraftStatus
}): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const row = [
      input.account_id,
      input.contact_id ?? null,
      input.subject ?? null,
      input.body ?? null,
      input.personalization ?? null,
      input.signal ?? null,
      input.status ?? "draft",
    ];
    if (input.id) {
      const hit = await asPerson(me.id, (q) => q<Id>(
        `update mc.outreach_drafts
            set account_id = $2, contact_id = $3, subject = $4, body = $5,
                personalization = $6, signal = $7, status = $8
          where id = $1 returning id`,
        [input.id, ...row],
      ));
      { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    } else {
      await asPerson(me.id, (q) => q(
        `insert into mc.outreach_drafts
           (account_id, contact_id, subject, body, personalization, signal, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [...row, me.id],
      ));
    }
    revalidatePath(`/gtm/${input.account_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function reviewOutreachDraft(
  id: string, accountId: string, status: DraftStatus, note?: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.outreach_drafts
          set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
        where id = $1 returning id`,
      [id, status, me.id, note ?? null],
    ));
    { const w = wrote(hit, "draft"); if (!w.ok) return w; }
    revalidatePath(`/gtm/${accountId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Requisitions (spec 12-24) ----------------------------------------------

/**
 * Create a requisition.
 *
 * Only facts are accepted. Grade, close probability, delivery need and the
 * recommended action are all computed by the database trigger: passing them
 * in would be meaningless, which is the point of section 13.
 */
export async function createRequisition(input: {
  company: string
  role_title: string
  openings: number
  comp_target: number | null
  fee_percent: number | null
  agreement_signed: boolean
  search_type: string
  competition: string
  approval: string
  target_start: string | null
  consequence: string
  intake_with: string
  hm_access: string
  process_defined: string
  interviews_from: string | null
  work_arrangement: string
  relocation: string
  clearance: string
  industry_need: string
  must_haves: string
  adjacent_ok: string
  owner_id: string
  notes?: string
}): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");

    const [row] = await asPerson(me.id, (q) => q<Id>(
      `insert into mc.requisitions
         (company, role_title, openings, comp_target, fee_percent, agreement_signed,
          search_type, competition, approval, target_start, consequence, intake_with,
          hm_access, process_defined, interviews_from, work_arrangement, relocation,
          clearance, industry_need, must_haves, adjacent_ok, owner_id, notes, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21, $22, $23, $24, $25)
       returning id`,
      [
        input.company.trim(),
        input.role_title.trim(),
        input.openings,
        input.comp_target,
        input.fee_percent,
        input.agreement_signed,
        input.search_type,
        input.competition,
        input.approval,
        input.target_start,
        input.consequence,
        input.intake_with,
        input.hm_access,
        input.process_defined,
        input.interviews_from,
        input.work_arrangement,
        input.relocation,
        input.clearance,
        input.industry_need,
        input.must_haves,
        input.adjacent_ok,
        input.owner_id,
        input.notes || null,
        input.agreement_signed ? "active" : "not_activated",
        me.id,
      ],
    ));

    revalidatePath("/requisitions");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

// The facts and live signals a person may edit. Scores, grades, the
// recommended action and the lifecycle stamps are the triggers' to write.
const REQUISITION_PATCH = [
  "client_id", "company", "role_title", "openings", "comp_min", "comp_target", "comp_max",
  "fee_percent", "agreement_signed", "date_received", "search_type", "competition",
  "approval", "target_start", "consequence", "intake_with", "hm_access", "process_defined",
  "interviews_from", "work_arrangement", "relocation", "clearance", "industry_need",
  "must_haves", "adjacent_ok", "viable_candidates", "best_stage", "client_likes",
  "feedback_days", "requirement_changes", "last_progress_at", "status", "owner_id",
  "function_id", "notes", "search_difficulty", "sprint_target_override", "outcome_kind",
  "outcome_detail", "pause_reason", "expected_reopen", "engagement_type", "exclusivity",
  "hiring_manager", "location",
] as const;

/** Update the live signals that move close probability (sections 27, 28). */
export async function updateRequisition(
  id: string,
  patch: Record<string, unknown>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, REQUISITION_PATCH, 2);
    if (set.empty) return { ok: true };
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.requisitions set ${set.sql} where id = $1 returning id`,
      [id, ...set.values],
    ));
    { const w = wrote(hit, "requisition"); if (!w.ok) return w; }
    revalidatePath("/requisitions");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- GTM approval gates (spec 57, 65) --------------------------------------

/**
 * Approve an account for outreach preparation.
 *
 * The one place approval happens. Section 65 forbids the system from approving
 * a target on its own, and the database refuses any stage past this without an
 * approver on record, so this action is the only route through.
 */
export async function approveGtmAccount(accountId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    if (!atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can approve an account." };
    }

    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.gtm_accounts set stage = 'approved_build', approved_by = $2 where id = $1 returning id",
      [accountId, me.id],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }

    revalidatePath("/gtm");
    revalidatePath(`/gtm/${accountId}`);
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Launch outreach. Never automatic (section 65).
 *
 * Separate from approval on purpose: approving says "pursue this company",
 * launching says "start contacting people today". They are different
 * decisions and often days apart.
 */
export async function launchGtmOutreach(accountId: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    if (!atLeast(me.role, "admin")) {
      return { ok: false, error: "Only an owner or admin can launch outreach." };
    }

    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.gtm_accounts set stage = 'outreach_active', launched_by = $2 where id = $1 returning id",
      [accountId, me.id],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }

    revalidatePath("/gtm");
    revalidatePath(`/gtm/${accountId}`);
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Park an account, optionally with a date to look at it again (section 47). */
export async function holdGtmAccount(
  accountId: string, reason?: string, until?: string | null,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      "update mc.gtm_accounts set stage = 'hold', hold_reason = $2, hold_until = $3 where id = $1 returning id",
      [accountId, reason ?? null, until ?? null],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Decline an account. Closing requires saying why (section 10). */
export async function rejectGtmAccount(
  accountId: string, reason: string,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const hit = await asPerson(me.id, (q) => q<Id>(
      `update mc.gtm_accounts set stage = 'complete', outcome = 'not_a_fit', outcome_note = $2
        where id = $1 returning id`,
      [accountId, reason],
    ));
    { const w = wrote(hit, "account"); if (!w.ok) return w; }
    revalidatePath("/gtm");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}
