// Import the ALAC Desk Command Center workbook.
//
//   npm run import:desk
//
// Reads ALAC_DATA_DIR/ALAC Desk Command Center.xlsx and loads three tabs:
// ACCOUNT QUEUE, _SIGNAL LOG, and PERFORMANCE. COMMAND BOARD is not imported,
// because it is a derived view: every number on it is a ranking or a rollup of
// the other three, and importing it would create a second copy that can drift.
//
// The workbook is client data and never enters this repo. ALAC_DATA_DIR points
// outside it.
//
// Safe to run twice: every table has a unique key and every write is an upsert
// that preserves the desk's own edits where the workbook has nothing to say.

import { config } from "dotenv";
import pg from "pg";
import { openWorkbook, serialToISO, colIdx } from "../src/lib/server/import/xlsx.mjs";
import { normCompany } from "../src/lib/server/import/normalize.mjs";

config({ path: ".env.local" });

const dataDir = process.env.ALAC_DATA_DIR;
if (!dataDir) {
  console.error("ALAC_DATA_DIR is not set. It points at the directory holding the real workbook,");
  console.error("which lives outside this repository. See .env.example.");
  process.exit(1);
}

const FILE = `${dataDir}/ALAC Desk Command Center.xlsx`;
const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";

const cell = (row, letter) => (row.cells[colIdx(`${letter}1`)] ?? "").trim();
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

// The workbook writes "Priority 1"; the enum is priority_1. UNSCORED is a real
// state, not a missing value, so it maps rather than falling through to null.
const PRIORITY = {
  "Priority 1": "priority_1",
  "Priority 2": "priority_2",
  "Priority 3": "priority_3",
  UNSCORED: "unscored",
};

const MOTIONS = new Set(["TBD", "LIVE LEAD", "GENERAL BD", "MPC WEDGE", "NURTURE", "HOLD"]);
const PREP = new Set(["NOT STARTED", "IN RESEARCH", "READY FOR QC", "APPROVED", "HOLD"]);
const HEYREACH = new Set(["NOT LOADED", "ACTIVE", "COMPLETE"]);
const SOURCEWHALE = new Set(["NOT LOADED", "STAGED", "ACTIVE", "COMPLETE", "HOLD"]);

/**
 * Map a dropdown value onto its enum, collecting anything unrecognised.
 *
 * An unknown value is reported rather than coerced to the default. Silently
 * turning an unexpected status into NOT STARTED would understate how much work
 * is actually done, which is exactly the kind of quiet wrongness the operating
 * instructions are written to prevent.
 */
function enumOr(value, allowed, fallback, unknown, label) {
  const v = (value ?? "").trim();
  if (v === "") return fallback;
  if (allowed.has(v)) return v;
  unknown.push(`${label}: ${v}`);
  return fallback;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

/**
 * Insert rows as chunked multi row VALUES.
 *
 * One statement per row is the obvious shape and it is unusable here: the
 * database is remote, so 3,045 accounts means 3,045 round trips and an import
 * that runs for minutes. Batching at 200 rows turns it into about 16.
 *
 * 200 is chosen against the parameter ceiling rather than by feel: Postgres
 * allows 65535 bound parameters per statement, and the widest table here binds
 * 16 per row, so the ceiling is about 4,000 rows. 200 leaves a wide margin for
 * a column being added later.
 */
async function insertChunked(table, columns, rows, conflictTarget, updateSet, chunk = 200) {
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params = [];
    const tuples = slice.map((row) => {
      const placeholders = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(", ")}) values ${tuples.join(",")}
       on conflict (${conflictTarget}) do update set ${updateSet}`,
      params,
    );
    done += slice.length;
  }
  return done;
}

const run = async () => {
  await client.connect();

  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) {
    throw new Error(`No org with slug "${ORG_SLUG}". Run create:user first.`);
  }
  const orgId = orgs.rows[0].id;

  const wb = openWorkbook(FILE);
  console.log(`Workbook: ${wb.sheetNames.length} tabs`);

  // Claim the run before any write. CLAUDE.md: the agent_runs row exists before
  // the side effects, never after, so a crash still leaves evidence.
  const runRow = await client.query(
    `insert into agent_runs (org_id, kind, status, trigger, params, started_at)
     values ($1, 'import', 'running', 'manual', $2::jsonb, now()) returning id`,
    [orgId, JSON.stringify({ source: "desk_workbook" })],
  );
  const runId = runRow.rows[0].id;

  const unknown = [];
  let ok = 0;
  let failed = 0;

  try {
    // -----------------------------------------------------------------------
    // ACCOUNT QUEUE. Header is row 4, data starts at row 5.
    // -----------------------------------------------------------------------
    const aq = wb.sheet("ACCOUNT QUEUE").filter((r) => r.rnum >= 5 && cell(r, "A"));
    console.log(`ACCOUNT QUEUE: ${aq.length} rows`);

    const aqRows = [];
    const seenRecord = new Set();
    for (const r of aq) {
      const company = cell(r, "E");
      if (!company) {
        failed += 1;
        continue;
      }

      // "STRATEGIC" is not an identifier, it is a marker: the instructions
      // define it as a Top or Next account that is not yet finalized in the
      // scored TAM. Every such row carries the same literal, so keying on it
      // directly collapses all of them into one account. They are keyed by
      // company instead, which keeps them distinct and keeps a re-import
      // idempotent. The priority column already records them as UNSCORED.
      const rawId = cell(r, "A");
      const recordId = !rawId || rawId === "STRATEGIC" ? `STRATEGIC:${normCompany(company)}` : rawId;

      // One company, one row. A repeated key would make the batch insert hit
      // its own conflict target twice in a single statement, which Postgres
      // rejects outright, so a genuine duplicate is dropped here and counted
      // rather than taking the whole chunk down with it.
      if (seenRecord.has(recordId)) {
        failed += 1;
        unknown.push(`Duplicate Record ID: ${recordId}`);
        continue;
      }
      seenRecord.add(recordId);

      const priorityRaw = cell(r, "B");
      const priority = priorityRaw ? PRIORITY[priorityRaw] ?? null : null;
      if (priorityRaw && !priority) unknown.push(`Priority: ${priorityRaw}`);

      aqRows.push([
        orgId,
        recordId,
        priority,
        num(cell(r, "C")),
        company,
        normCompany(company),
        cell(r, "F") || null,
        cell(r, "D").toUpperCase() === "YES",
        cell(r, "G") || null,
        cell(r, "H") || null,
        enumOr(cell(r, "I"), MOTIONS, "TBD", unknown, "Motion"),
        enumOr(cell(r, "J"), PREP, "NOT STARTED", unknown, "Prep"),
        enumOr(cell(r, "K"), HEYREACH, "NOT LOADED", unknown, "HeyReach"),
        serialToISO(cell(r, "L")),
        cell(r, "N").toLowerCase() === "yes",
        enumOr(cell(r, "M"), SOURCEWHALE, "NOT LOADED", unknown, "SourceWhale"),
      ]);
    }

    await client.query("begin");
    ok = await insertChunked(
      "tam_accounts",
      [
        "org_id", "record_id", "priority", "final_score", "company_name",
        "norm_name", "linkedin_url", "next_week", "sales_nav_url",
        "battlecard_url", "recommended_motion", "prep_status",
        "heyreach_stage", "heyreach_date", "heyreach_uploaded",
        "sourcewhale_stage",
      ],
      aqRows,
      "org_id, record_id",
      `priority = excluded.priority,
       final_score = excluded.final_score,
       company_name = excluded.company_name,
       norm_name = excluded.norm_name,
       linkedin_url = excluded.linkedin_url,
       next_week = excluded.next_week,
       sales_nav_url = excluded.sales_nav_url,
       battlecard_url = excluded.battlecard_url,
       recommended_motion = excluded.recommended_motion,
       prep_status = excluded.prep_status,
       heyreach_stage = excluded.heyreach_stage,
       heyreach_date = excluded.heyreach_date,
       heyreach_uploaded = excluded.heyreach_uploaded,
       sourcewhale_stage = excluded.sourcewhale_stage,
       updated_at = now()`,
    );

    // Prune inside the same transaction as the upsert, and before anything
    // links to an account.
    //
    // The workbook is the source of truth, so the import mirrors it rather than
    // only adding to it: a company that has left the ACCOUNT QUEUE has to leave
    // the table too, or the app keeps showing an account the desk has dropped.
    //
    // It also repairs a key change. When the identity rule for a row changes,
    // for example strategic rows moving off the shared "STRATEGIC" literal onto
    // a per company key, the row written under the old key is orphaned and
    // shows up as a duplicate company. Pruning to exactly what this run saw
    // removes it with no hand written cleanup.
    //
    // Order matters: this runs before the signal link below, so a signal can
    // never bind to a row that is about to be deleted and end up unlinked.
    // The deletes are safe, people.account_id and heat_signals.account_id are
    // both "on delete set null", so a contact or a signal survives its company
    // leaving the queue.
    const pruned = await client.query(
      `delete from tam_accounts
        where org_id = $1 and record_id <> all($2::text[])`,
      [orgId, [...seenRecord]],
    );
    await client.query("commit");

    // -----------------------------------------------------------------------
    // _SIGNAL LOG. The log is the source; SIGNAL HEAT is its sorted view, so
    // importing the log avoids carrying a rank that is recomputed anyway.
    // Header is row 1, data from row 2.
    // -----------------------------------------------------------------------
    const log = wb.sheet("_SIGNAL LOG").filter((r) => r.rnum >= 2 && cell(r, "A"));
    console.log(`_SIGNAL LOG: ${log.length} rows`);

    // Resolve Record ID to account id once, rather than a correlated subquery
    // per row. Roughly a third of the log is ALAC-SIG-*, a company that made a
    // signal but is not in the scored TAM, and those stay unlinked on purpose.
    const idMap = new Map(
      (await client.query("select record_id, id from tam_accounts where org_id = $1", [orgId])).rows.map(
        (r) => [r.record_id, r.id],
      ),
    );
    let unlinked = 0;

    const seenKey = new Set();
    const sigRows = [];
    for (const r of log) {
      const company = cell(r, "A");
      const recordId = cell(r, "N");
      // A signal is keyed by company plus date: the same company can produce a
      // second signal later, and that is a new row rather than an overwrite.
      const signalDate = serialToISO(cell(r, "C")) ?? cell(r, "C") ?? "";
      const key = `${normCompany(company)}|${signalDate}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);

      const accountId = recordId.startsWith("ALAC-SIG") ? null : idMap.get(recordId) ?? null;
      if (!accountId) unlinked += 1;

      sigRows.push([
        orgId,
        key,
        company,
        normCompany(company),
        accountId,
        serialToISO(cell(r, "C")),
        cell(r, "D") || "(not recorded)",
        cell(r, "E") || null,
        cell(r, "F") || null,
        cell(r, "M") || null,
        int(cell(r, "G")),
        int(cell(r, "H")),
        int(cell(r, "I")),
        int(cell(r, "J")),
        int(cell(r, "K")),
        int(cell(r, "L")),
        int(cell(r, "B")),
        num(cell(r, "O")),
        int(cell(r, "P")),
        cell(r, "Q") || null,
        cell(r, "R") || null,
        serialToISO(cell(r, "S")),
      ]);
    }

    await client.query("begin");
    const signals = await insertChunked(
      "heat_signals",
      [
        "org_id", "signal_key", "company_name", "norm_name", "account_id",
        "signal_date", "what_happened", "the_number", "hq", "best_contact",
        "hiring_urgency", "icp_fit", "capital", "talent_scarcity", "access",
        "freshness", "heat_score", "tam_final_score", "heat_vs_tam",
        "recommended_move", "primary_source", "last_scored",
      ],
      sigRows,
      "org_id, signal_key",
      `company_name = excluded.company_name,
       account_id = excluded.account_id,
       what_happened = excluded.what_happened,
       the_number = excluded.the_number,
       hq = excluded.hq,
       best_contact = excluded.best_contact,
       hiring_urgency = excluded.hiring_urgency,
       icp_fit = excluded.icp_fit,
       capital = excluded.capital,
       talent_scarcity = excluded.talent_scarcity,
       access = excluded.access,
       freshness = excluded.freshness,
       heat_score = excluded.heat_score,
       tam_final_score = excluded.tam_final_score,
       heat_vs_tam = excluded.heat_vs_tam,
       recommended_move = excluded.recommended_move,
       primary_source = excluded.primary_source,
       last_scored = excluded.last_scored`,
    );
    await client.query("commit");

    // -----------------------------------------------------------------------
    // PERFORMANCE. The weekly grid starts at row 10, under the header at row 9.
    // -----------------------------------------------------------------------
    const perf = wb.sheet("PERFORMANCE").filter((r) => r.rnum >= 10 && cell(r, "A"));
    console.log(`PERFORMANCE: ${perf.length} weeks`);

    const seenWeek = new Set();
    const perfRows = [];
    for (const r of perf) {
      const weekEnding = serialToISO(cell(r, "A"));
      if (!weekEnding || seenWeek.has(weekEnding)) continue;
      seenWeek.add(weekEnding);
      perfRows.push([
        orgId,
        weekEnding,
        int(cell(r, "B")),
        int(cell(r, "C")),
        int(cell(r, "D")),
        int(cell(r, "E")),
        int(cell(r, "F")),
        int(cell(r, "G")),
        int(cell(r, "H")),
        int(cell(r, "I")),
        cell(r, "J") || null,
        cell(r, "K") || null,
        cell(r, "L") || null,
        cell(r, "M") || null,
        cell(r, "N") || null,
        cell(r, "O") || null,
        cell(r, "P") || null,
        cell(r, "Q") || null,
        cell(r, "R") || null,
        cell(r, "S") ? cell(r, "S").toUpperCase() === "YES" : null,
      ]);
    }

    await client.query("begin");
    const weeks = await insertChunked(
      "performance_weeks",
      [
        "org_id", "week_ending", "bd_calls", "client_conversations",
        "discoveries", "qualified_opps", "commercial_asks", "searches_won",
        "pipeline_usd", "placements", "choke_point", "evidence", "hypothesis",
        "countermeasure", "marketing_brief", "priority_1", "priority_2",
        "priority_3", "research_tasking", "top_10_ready",
      ],
      perfRows,
      "org_id, week_ending",
      `bd_calls = excluded.bd_calls,
       client_conversations = excluded.client_conversations,
       discoveries = excluded.discoveries,
       qualified_opps = excluded.qualified_opps,
       commercial_asks = excluded.commercial_asks,
       searches_won = excluded.searches_won,
       pipeline_usd = excluded.pipeline_usd,
       placements = excluded.placements,
       choke_point = excluded.choke_point,
       evidence = excluded.evidence,
       hypothesis = excluded.hypothesis,
       countermeasure = excluded.countermeasure,
       marketing_brief = excluded.marketing_brief,
       priority_1 = excluded.priority_1,
       priority_2 = excluded.priority_2,
       priority_3 = excluded.priority_3,
       research_tasking = excluded.research_tasking,
       top_10_ready = excluded.top_10_ready`,
    );
    await client.query("commit");

    const matched = await client.query(
      `update people p set account_id = a.id
         from tam_accounts a
        where p.org_id = $1 and a.org_id = $1
          and p.account_id is null
          and p.norm_company is not null
          and p.norm_company = a.norm_name`,
      [orgId],
    );

    const unmatched = await client.query(
      "select count(*)::int as n from people where org_id = $1 and account_id is null",
      [orgId],
    );

    await client.query(
      `update agent_runs set status = $2, items_total = $3, items_ok = $4,
              items_failed = $5, finished_at = now(),
              duration_ms = extract(epoch from (now() - started_at)) * 1000
         where id = $1`,
      [runId, failed > 0 ? "partial" : "complete", aq.length, ok, failed],
    );

    console.log("");
    console.log(`  accounts     ${ok} ok, ${failed} failed, ${pruned.rowCount} pruned`);
    console.log(`  signals      ${signals} (${unlinked} not linked to a TAM account)`);
    console.log(`  perf weeks   ${weeks}`);
    console.log(`  people       ${matched.rowCount} rematched, ${unmatched.rows[0].n} unmatched`);

    if (unknown.length > 0) {
      // Honest counts. An unrecognised dropdown value is reported, never
      // folded into the default without saying so.
      const counts = new Map();
      for (const u of unknown) counts.set(u, (counts.get(u) ?? 0) + 1);
      console.log("");
      console.log(`  ${unknown.length} unrecognised dropdown values, defaulted:`);
      for (const [v, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`    ${String(n).padStart(5)}  ${v}`);
      }
    }
  } catch (err) {
    await client.query("rollback").catch(() => {});
    await client
      .query(
        `update agent_runs set status = 'failed', finished_at = now(),
                error = $2 where id = $1`,
        [runId, String(err?.message ?? err).slice(0, 2000)],
      )
      .catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
