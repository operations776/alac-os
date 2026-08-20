// Pull tracker signals from Fiber, score them, and record them.
//
//   npm run signals:pull              real signals since the last high water mark
//   npm run signals:pull -- --dummy   test signals, after signals:setup --dummy
//   npm run signals:pull -- --since 2026-08-01
//   npm run signals:pull -- --dry     fetch and score, write nothing
//
// Listing signals is free, so this is safe to run often. It writes only rows
// with source='fiber' and never touches the workbook's own rows, which is what
// lets both feeds run side by side until the desk trusts this one.
//
// The whole point of the exercise: a real world change becomes a scored row
// with its arithmetic attached.

import { config } from "dotenv";
import pg from "pg";
import { listTrackerSignals, fireTrackerDummy, redact } from "../src/lib/server/integrations/fiber.mjs";
import { parseSignal, signalKey, signalEntity, formatAmount } from "../src/lib/server/integrations/fiber-signals.mjs";
import { scoreHeat, heatVsTam } from "../src/lib/scoring/heat.mjs";
import { normCompany } from "../src/lib/server/import/normalize.mjs";

config({ path: ".env.local" });

const key = process.env.FIBER_API_KEY;
if (!key) {
  console.error("FIBER_API_KEY is not set. See .env.example.");
  process.exit(1);
}

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const DUMMY = process.argv.includes("--dummy");
const DRY = process.argv.includes("--dry");
const sinceArg = (() => {
  const i = process.argv.indexOf("--since");
  return i >= 0 ? process.argv[i + 1] : null;
})();

// The scoring date. Passed explicitly rather than read inside the scorer, so
// every signal in one run is aged against the same instant and the stored
// breakdown can be reconciled later.
const AS_OF = new Date().toISOString().slice(0, 10);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});


const run = async () => {
  await client.connect();

  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`No org with slug "${ORG_SLUG}".`);
  const orgId = orgs.rows[0].id;

  const listName = DUMMY ? "ALAC desk, integration test" : "ALAC account queue";
  const { rows: lists } = await client.query(
    "select external_id, name, last_signal_at from signal_watchlists where org_id = $1 and provider = 'fiber' and name = $2",
    [orgId, listName],
  );
  if (lists.length === 0) {
    console.error(`No watchlist named "${listName}". Run signals:setup${DUMMY ? " -- --apply --dummy" : " -- --apply"} first.`);
    process.exit(1);
  }
  const list = lists[0];
  console.log(`List:   ${list.name} (${list.external_id})`);

  // Claim the run before any side effect. CLAUDE.md: the agent_runs row exists
  // before the work, never after, so a crash still leaves evidence.
  const runRow = await client.query(
    `insert into agent_runs (org_id, kind, status, trigger, params, started_at)
     values ($1, 'import', 'running', 'manual', $2::jsonb, now()) returning id`,
    [orgId, JSON.stringify({ source: "fiber_tracker", dummy: DUMMY, dry: DRY })],
  );
  const runId = runRow.rows[0].id;

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  try {
    if (DUMMY) {
      console.log("Firing test signals (free, no cooldown)...");
      const fired = await fireTrackerDummy(key, list.external_id);
      const n = fired?.output?.signals?.length ?? "some";
      console.log(`  fired: ${n}`);
    }

    // Incremental by default: the high water mark is what keeps a re-pull
    // cheap and prevents re-scoring the same window every time.
    const since = sinceArg ?? (DUMMY ? null : list.last_signal_at?.toISOString?.() ?? null);
    console.log(`Since:  ${since ?? "beginning"}`);

    // Page through. Fiber caps page size and hands back a cursor.
    const raw = [];
    let cursor = null;
    for (let page = 0; page < 50; page += 1) {
      const res = await listTrackerSignals(key, list.external_id, {
        since: since ?? undefined,
        cursor: cursor ?? undefined,
        pageSize: 100,
        filter: DUMMY ? "dummy" : "real",
      });
      const batch = res?.output?.signals ?? [];
      raw.push(...batch);
      cursor = res?.output?.nextCursor ?? null;
      if (!cursor || batch.length === 0) break;
    }
    console.log(`Signals fetched: ${raw.length}`);

    if (raw.length === 0) {
      console.log("\nNothing new. The tracker refreshes on its own interval, so this is normal");
      console.log("shortly after setup: real signals appear once Fiber has run a refresh.");
      await client.query(
        "update agent_runs set status='complete', items_total=0, finished_at=now() where id=$1",
        [runId],
      );
      await client.end();
      return;
    }

    // Match by slug, which is the identifier the list was built from. The
    // fallback on normalized name catches a company whose slug changed since
    // the list was populated.
    const { rows: accounts } = await client.query(
      `select id, record_id, company_name, norm_name, linkedin_url, priority::text as priority,
              final_score
         from tam_accounts where org_id = $1`,
      [orgId],
    );
    const bySlug = new Map();
    const byName = new Map();
    for (const a of accounts) {
      const m = a.linkedin_url?.match(/linkedin\.com\/company\/([^/?#]+)/i);
      if (m) bySlug.set(decodeURIComponent(m[1]).toLowerCase(), a);
      byName.set(a.norm_name, a);
    }

    // Warm network per account, for the access component. One query, not one
    // per signal.
    const { rows: warmRows } = await client.query(
      `select account_id,
              count(*)::int as warm,
              count(*) filter (where is_decision_maker)::int as dm
         from people where org_id = $1 and account_id is not null group by account_id`,
      [orgId],
    );
    const warmBy = new Map(warmRows.map((r) => [r.account_id, r]));

    const toWrite = [];
    let newest = null;

    for (const s of raw) {
      const parsed = parseSignal(s);
      if (!parsed) {
        skipped += 1;
        continue;
      }
      const entity = signalEntity(s);
      const observedAt = s.occurredAt ?? s.observedAt ?? null;
      if (observedAt && (!newest || observedAt > newest)) newest = observedAt;

      const company = entity.name ?? entity.slug ?? "(unknown)";
      const norm = normCompany(company);
      const account = (entity.slug && bySlug.get(entity.slug)) ?? byName.get(norm) ?? null;

      const signalDate = parsed.occurredAt ?? (observedAt ? observedAt.slice(0, 10) : null);
      const warm = account ? warmBy.get(account.id) : null;

      const scored = scoreHeat({
        asOf: AS_OF,
        signalDate,
        priority: account?.priority ?? null,
        finalScore: account?.final_score != null ? Number(account.final_score) : null,
        amountUsd: parsed.amountUsd,
        roundLabel: parsed.roundLabel,
        warmContacts: warm ? warm.warm : account ? 0 : null,
        decisionMakers: warm ? warm.dm : account ? 0 : null,
        // Job data is not fetched here. It costs a credit per posting found,
        // so it is a separate opt in pass (ALAC-67) and its two components
        // report as gaps until then rather than as zeros.
        jobs: undefined,
      });

      const whatHappened = [parsed.summary, parsed.detail].filter(Boolean).join(". ") || parsed.label;

      toWrite.push({
        signal_key: signalKey(s, norm, signalDate),
        source_event_id: s.eventId ?? s.id ?? null,
        rule_type: parsed.rule_type,
        company_name: company,
        norm_name: norm,
        account_id: account?.id ?? null,
        signal_date: signalDate,
        what_happened: whatHappened,
        the_number: formatAmount(parsed.amountUsd),
        best_contact: null,
        components: scored.components,
        heat_score: scored.heat_score,
        tam_final_score: account?.final_score != null ? Number(account.final_score) : null,
        heat_vs_tam: heatVsTam(scored.heat_score, account?.final_score ?? null),
        recommended_move: null,
        primary_source: parsed.sourceUrl,
        breakdown: { terms: scored.terms, gaps: scored.gaps, asOf: AS_OF, methodology: parsed.methodology, kind: parsed.kind },
        coverage: scored.coverage,
        raw: s,
      });
    }

    console.log(`Parsed: ${toWrite.length} watched, ${skipped} ignored rules`);
    const matched = toWrite.filter((r) => r.account_id).length;
    console.log(`Matched to an account: ${matched} of ${toWrite.length}`);

    if (DRY) {
      console.log("\nDry run. Nothing was written.\n");
      for (const r of toWrite.slice(0, 10)) {
        console.log(`  heat ${String(r.heat_score).padStart(3)}  cov ${String(r.coverage).padStart(3)}%  ${r.rule_type.padEnd(28)}${r.company_name}`);
        console.log(`        ${r.what_happened.slice(0, 110)}`);
      }
      await client.query("update agent_runs set status='complete', items_total=$2, finished_at=now() where id=$1", [runId, toWrite.length]);
      await client.end();
      return;
    }

    await client.query("begin");
    for (const r of toWrite) {
      try {
        await client.query(
          `insert into heat_signals (
             org_id, signal_key, company_name, norm_name, account_id, signal_date,
             what_happened, the_number, best_contact,
             hiring_urgency, icp_fit, capital, talent_scarcity, access, freshness,
             heat_score, tam_final_score, heat_vs_tam, recommended_move,
             primary_source, source, source_event_id, rule_type, raw, breakdown,
             coverage, scored_at
           ) values (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
             'fiber',$21,$22,$23::jsonb,$24::jsonb,$25, now()
           )
           on conflict (org_id, signal_key) do update set
             account_id = excluded.account_id,
             what_happened = excluded.what_happened,
             the_number = excluded.the_number,
             hiring_urgency = excluded.hiring_urgency,
             icp_fit = excluded.icp_fit,
             capital = excluded.capital,
             talent_scarcity = excluded.talent_scarcity,
             access = excluded.access,
             freshness = excluded.freshness,
             heat_score = excluded.heat_score,
             tam_final_score = excluded.tam_final_score,
             heat_vs_tam = excluded.heat_vs_tam,
             primary_source = excluded.primary_source,
             raw = excluded.raw,
             breakdown = excluded.breakdown,
             coverage = excluded.coverage,
             scored_at = now()
           -- Never overwrite a workbook row with an automated one. The desk's
           -- own curation outranks the feed until it says otherwise.
           where heat_signals.source = 'fiber'`,
          [
            orgId, r.signal_key, r.company_name, r.norm_name, r.account_id, r.signal_date,
            r.what_happened, r.the_number, r.best_contact,
            r.components.hiring_urgency, r.components.icp_fit, r.components.capital,
            r.components.talent_scarcity, r.components.access, r.components.freshness,
            r.heat_score, r.tam_final_score, r.heat_vs_tam, r.recommended_move,
            r.primary_source, r.source_event_id, r.rule_type,
            JSON.stringify(r.raw), JSON.stringify(r.breakdown), r.coverage,
          ],
        );
        ok += 1;
      } catch (err) {
        failed += 1;
        console.log(`  failed ${r.company_name}: ${String(err.message).slice(0, 160)}`);
      }
    }
    await client.query("commit");

    if (newest && !DUMMY) {
      await client.query(
        "update signal_watchlists set last_pulled_at = now(), last_signal_at = greatest(coalesce(last_signal_at, to_timestamp(0)), $2::timestamptz) where org_id = $1 and external_id = $3",
        [orgId, newest, list.external_id],
      );
    } else {
      await client.query(
        "update signal_watchlists set last_pulled_at = now() where org_id = $1 and external_id = $2",
        [orgId, list.external_id],
      );
    }

    await client.query(
      `update agent_runs set status=$2, items_total=$3, items_ok=$4, items_failed=$5,
              finished_at=now(), duration_ms = extract(epoch from (now()-started_at))*1000
         where id=$1`,
      [runId, failed > 0 ? "partial" : "complete", toWrite.length, ok, failed],
    );

    console.log(`\n  written: ${ok} ok, ${failed} failed`);
    console.log(`  ignored: ${skipped} signals on rules the desk does not watch`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    await client
      .query("update agent_runs set status='failed', error=$2, finished_at=now() where id=$1", [
        runId,
        redact(String(err?.message ?? err), key).slice(0, 2000),
      ])
      .catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
};

run().catch((err) => {
  console.error(redact(String(err?.message ?? err), key));
  process.exit(1);
});
