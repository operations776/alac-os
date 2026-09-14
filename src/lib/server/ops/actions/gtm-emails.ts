"use server";

/**
 * A prospect's three cold email options, written and saved without anyone
 * typing them.
 *
 * The page used to open on three empty boxes per person, so the copy started
 * whenever somebody found the time, and on a busy week that was never. Now the
 * options exist as soon as the prospect does: added contacts get drafted in the
 * background, and opening a prospect with none drafts them there and then. The
 * person's job goes back to what it was meant to be: read three, refine one,
 * approve it.
 *
 * Two things this never does. It never overwrites an option a person wrote
 * unless they asked for a regenerate, and it never touches a final copy that
 * already has text, because that is the part somebody refined by hand.
 *
 * AI.md rules carried over: the agent_runs row is claimed before the paid call,
 * tokens and cost land on it, and an option whose text names anything not in
 * the context is rejected and counted, never saved.
 */

import { asPerson, opsQuery } from "@/lib/server/db";
import { requirePerson } from "@/lib/server/ops/context";
import { type Result, fail } from "@/lib/server/ops/result";
import { reasoningStatus } from "@/lib/server/ai/openai";
import {
  GTM_EMAIL_PROMPT_VERSION, buildGtmEmailContext, writeGtmEmails, type GtmEmailInput,
  type GtmEmailResult,
} from "@/lib/server/ai/gtm-email";

const IN_FLIGHT_SQL = `
  select 1 from agent_runs
   where org_id = $1 and kind = 'draft_message' and status = 'running'
     and params->>'feature' = 'gtm_email' and params->>'contact_id' = $2
     and started_at > now() - interval '3 minutes'
   limit 1`;

/**
 * Write the three options for one prospect.
 *
 * Without `regenerate` only empty slots are filled, so a person's option is
 * never replaced. With it all three are rewritten; final copy is still left
 * alone. Either way, an empty final copy is prefilled from option 1, so there
 * is always something ready to review and approve.
 */
export async function generateProspectEmails(
  accountId: string, contactId: string, opts?: { regenerate?: boolean },
): Promise<Result<{ filled: number; failed: number }>> {
  try {
    const { session, me } = await requirePerson("member");
    const regenerate = opts?.regenerate === true;

    const status = reasoningStatus();
    if (!status.available) return { ok: false, error: `AI drafting is off: ${status.reason}` };

    const [account] = await opsQuery<GtmEmailInput["account"]>(
      `select company, website, industry, signal_source, signal_note, signal_date, why_now, notes
         from mc.gtm_accounts where id = $1`,
      [accountId],
    );
    if (!account) return { ok: false, error: "That account no longer exists." };
    const [contact] = await opsQuery<GtmEmailInput["contact"]>(
      `select name, title, seniority, hiring_for, rationale, linkedin_url
         from mc.gtm_contacts where id = $1 and account_id = $2`,
      [contactId, accountId],
    );
    if (!contact) return { ok: false, error: "That prospect is no longer on this account." };
    const evidence = await opsQuery<GtmEmailInput["evidence"][number]>(
      `select claim, source_title, published_on from mc.gtm_evidence
        where account_id = $1 order by published_on desc nulls last, created_at desc limit 20`,
      [accountId],
    );

    // Adding a prospect starts a draft in the background, and the natural next
    // click is opening that prospect, which asks again. Wait for the first run
    // rather than pay twice; the slot check below then sees what it wrote.
    // ponytail: check then claim, two exact simultaneous clicks can both call
    // the model. The writes stay correct (empty slots only), only the spend
    // doubles. A partial unique index on running runs if it ever matters.
    for (let i = 0; i < 60; i += 1) {
      const busy = await opsQuery(IN_FLIGHT_SQL, [session.orgId, contactId]);
      if (!busy.length) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // The draft for this contact, created on first use: draftForContact's logic.
    const { draftId, researchUrl, written } = await asPerson(me.id, async (q) => {
      const [existing] = await q<{ id: string; research_url: string | null }>(
        `select id, research_url from mc.outreach_drafts where contact_id = $1
          order by updated_at desc limit 1`,
        [contactId],
      );
      const draft = existing ?? (await q<{ id: string; research_url: string | null }>(
        `insert into mc.outreach_drafts (account_id, contact_id, status)
         values ($1, $2, 'draft') returning id, research_url`,
        [accountId, contactId],
      ))[0];
      const slots = await q<{ slot: number }>(
        `select slot from mc.outreach_variations
          where draft_id = $1 and revision = 1 and slot between 1 and 3
            and coalesce(btrim(body), '') <> ''`,
        [draft.id],
      );
      return { draftId: draft.id, researchUrl: draft.research_url, written: slots.map((s) => s.slot) };
    });

    if (!regenerate && written.length >= 3) return { ok: true, data: { filled: 0, failed: 0 } };

    const context = buildGtmEmailContext({ account, contact, evidence, research_url: researchUrl });
    const [run] = await opsQuery<{ id: string }>(
      `insert into agent_runs (org_id, kind, status, trigger, triggered_by, params, model, prompt_version, items_total, started_at)
       values ($1, 'draft_message', 'running', 'api', $2, $3::jsonb, $4, $5, 3, now())
       returning id`,
      [session.orgId, session.userId,
       JSON.stringify({ feature: "gtm_email", account_id: accountId, contact_id: contactId, draft_id: draftId, regenerate }),
       status.model, GTM_EMAIL_PROMPT_VERSION],
    );

    let gen: GtmEmailResult | null = null;
    const closeRun = (
      runStatus: "complete" | "partial" | "failed", ok: number, log: unknown[], error: string | null,
    ) => opsQuery(
      `update agent_runs set status = $2::agent_run_status, items_ok = $3, items_failed = $4,
              input_tokens = $5, output_tokens = $6, cost_usd = $7, log = $8::jsonb, error = $9,
              finished_at = now(), duration_ms = (extract(epoch from now() - started_at) * 1000)::int
        where id = $1`,
      [run.id, runStatus, ok, 3 - ok, gen?.inputTokens ?? 0, gen?.outputTokens ?? 0, gen?.costUsd ?? 0,
       JSON.stringify(log), error?.slice(0, 2000) ?? null],
    ).catch((e) => console.error("gtm_email: could not close agent run", run.id, e));

    let saved: { slot: number; md5: string }[];
    try {
      gen = await writeGtmEmails(context);
      const good = gen.options.filter((o): o is NonNullable<typeof o> => o !== null);
      const faults = gen.faults.filter(Boolean).join("; ") || null;
      if (!good.length) {
        await closeRun("failed", 0, [], faults);
        return { ok: false, error: `None of the three emails passed the checks, so nothing was saved: ${gen.faults[0]}.` };
      }

      // Regenerate keeps each option in its own slot and leaves a slot alone
      // when its option failed. Filling puts the passing options into the
      // empty slots in order.
      const plan = regenerate
        ? gen.options.flatMap((o, i) => (o ? [{ slot: i + 1, ...o }] : []))
        : [1, 2, 3].filter((s) => !written.includes(s))
            .slice(0, good.length).map((slot, i) => ({ slot, ...good[i] }));

      saved = await asPerson(me.id, async (q) => {
        // The empty-body condition sits in the upsert itself, so an option a
        // person saved while the model was writing still wins.
        const rows = await q<{ slot: number; md5: string }>(
          `insert into mc.outreach_variations as v (draft_id, slot, revision, subject, body, created_by)
           select $1, r.slot, 1, r.subject, r.body, $2
             from jsonb_to_recordset($3::jsonb) as r(slot int, subject text, body text)
           on conflict (draft_id, revision, slot) do update
             set subject = excluded.subject, body = excluded.body, created_by = excluded.created_by
             where $4::boolean or coalesce(btrim(v.body), '') = ''
           returning v.slot, md5(v.body) as md5`,
          [draftId, me.id, JSON.stringify(plan), regenerate],
        );
        await q(
          `update mc.outreach_drafts d
              set final_subject = v.subject, final_body = v.body, final_from_variation = v.id
             from mc.outreach_variations v
            where d.id = $1 and v.draft_id = d.id and v.revision = 1 and v.slot = 1
              and coalesce(btrim(v.body), '') <> '' and coalesce(btrim(d.final_body), '') = ''`,
          [draftId],
        );
        return rows;
      });

      await closeRun(
        good.length === 3 ? "complete" : "partial", good.length,
        // What the model wrote, by hash, so a later regenerate can tell an
        // untouched option from one a person edited.
        saved.map((s) => ({ slot: s.slot, md5: s.md5 })), faults,
      );
    } catch (e) {
      await closeRun("failed", 0, [], (e as Error).message ?? String(e));
      throw e;
    }

    return { ok: true, data: { filled: saved.length, failed: 3 - gen.options.filter(Boolean).length } };
  } catch (e) { return fail(e); }
}

/**
 * Draft every prospect on the account that has fewer than three options.
 *
 * One at a time, so a slow model never has five paid calls open at once, and
 * the counts are honest: drafted, skipped because a person or another run got
 * there first, and failed with the reason.
 */
export async function generateAccountEmails(
  accountId: string,
): Promise<Result<{ ok: number; skipped: number; failed: number; errors: string[] }>> {
  try {
    await requirePerson("member");
    const status = reasoningStatus();
    if (!status.available) return { ok: false, error: `AI drafting is off: ${status.reason}` };

    const contacts = await opsQuery<{ id: string; name: string; written: number }>(
      `select c.id, c.name,
              coalesce((select count(*)::int from mc.outreach_variations v
                         where v.draft_id = d.id and v.revision = 1 and v.slot between 1 and 3
                           and coalesce(btrim(v.body), '') <> ''), 0) as written
         from mc.gtm_contacts c
         left join lateral (select id from mc.outreach_drafts
                             where contact_id = c.id order by updated_at desc limit 1) d on true
        where c.account_id = $1
        order by c.seniority, c.name`,
      [accountId],
    );

    const counts = { ok: 0, skipped: 0, failed: 0, errors: [] as string[] };
    for (const c of contacts) {
      if (c.written >= 3) { counts.skipped += 1; continue; }
      const r = await generateProspectEmails(accountId, c.id);
      if (!r.ok) { counts.failed += 1; counts.errors.push(`${c.name}: ${r.error}`); }
      else if (r.data?.filled) counts.ok += 1;
      else counts.skipped += 1;
    }
    return { ok: true, data: counts };
  } catch (e) { return fail(e); }
}

/**
 * How many of a draft's options were not written by the model as they stand,
 * so Regenerate can ask before replacing somebody's work. An option counts as
 * the model's only while its text still hashes to what a gtm_email run saved.
 */
export async function countPersonWrittenOptions(
  draftId: string,
): Promise<Result<{ count: number }>> {
  try {
    const { session } = await requirePerson("member");
    const [row] = await opsQuery<{ count: number }>(
      `select count(*)::int as count from mc.outreach_variations v
        where v.draft_id = $1 and v.revision = 1 and v.slot between 1 and 3
          and coalesce(btrim(v.body), '') <> ''
          and not exists (
            select 1 from agent_runs r
             where r.org_id = $2 and r.kind = 'draft_message'
               and r.params->>'feature' = 'gtm_email' and r.params->>'draft_id' = v.draft_id::text
               and r.log @> jsonb_build_array(jsonb_build_object('slot', v.slot, 'md5', md5(v.body))))`,
      [draftId, session.orgId],
    );
    return { ok: true, data: { count: row?.count ?? 0 } };
  } catch (e) { return fail(e); }
}
