#!/usr/bin/env node
// Scores every account, then assigns tiers by rank.
//
// Deterministic only: no model call, no API key needed, no cost. The reasoning
// pass is a separate step that explains these numbers rather than producing
// them.

import pg from "pg";
import dotenv from "dotenv";
import { computeScore, tierForRank } from "../src/lib/scoring/compute.mjs";

dotenv.config({ path: ".env.local", quiet: true });

const ORG_SLUG = process.env.ALAC_ORG_SLUG || "alac";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

let exitCode = 0;
try {
  const { rows: orgRows } = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (!orgRows.length) throw new Error(`No org with slug "${ORG_SLUG}". Run the importers first.`);
  const orgId = orgRows[0].id;

  // Claim the run before doing the work. Data law 3.
  const { rows: runRows } = await client.query(
    `insert into agent_runs (org_id, kind, trigger, prompt_version, params)
     values ($1, 'score_deterministic', 'manual', 'score-v1', '{}'::jsonb) returning id`,
    [orgId],
  );
  const runId = runRows[0].id;

  // Relationship inputs come from people, so they are aggregated here rather
  // than recomputed per row.
  const { rows: accounts } = await client.query(
    `select a.*,
            exists (select 1 from people p
                     where p.account_id = a.id and p.is_decision_maker) as has_decision_maker,
            (select max(p.connected_on) from people p where p.account_id = a.id) as most_recent_connection
       from accounts a
      where a.org_id = $1`,
    [orgId],
  );
  console.log(`Scoring ${accounts.length} accounts`);

  const scored = accounts.map((a) => ({ account: a, result: computeScore(a) }));

  // Insert scores in bulk. A round trip per account would take an hour.
  const CHUNK = 250;
  const COLS = 10;
  let written = 0;

  for (let i = 0; i < scored.length; i += CHUNK) {
    const chunk = scored.slice(i, i + CHUNK);
    await client.query("begin");
    try {
      const params = [];
      const tuples = chunk.map((s, n) => {
        const c = s.result.components;
        params.push(
          orgId, s.account.id, runId, s.result.score,
          c.icp_fit_score, c.hiring_signal_score, c.timing_score,
          c.relationship_score, c.revenue_potential_score,
          JSON.stringify(s.result.breakdown),
        );
        const base = n * COLS;
        return `(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(",")})`;
      });

      await client.query(
        `insert into account_scores (
           org_id, account_id, agent_run_id, score,
           icp_fit_score, hiring_signal_score, timing_score,
           relationship_score, revenue_potential_score, breakdown
         ) values ${tuples.join(",")}`,
        params,
      );

      // Mirror the newest score onto the account for cheap sorting.
      const mirrorParams = [];
      const mirrorCases = chunk.map((s, n) => {
        mirrorParams.push(s.account.id, s.result.score);
        return `($${n * 2 + 1}::uuid, $${n * 2 + 2}::int)`;
      });
      await client.query(
        `update accounts a set latest_score = v.score, latest_score_at = now()
           from (values ${mirrorCases.join(",")}) as v(id, score)
          where a.id = v.id`,
        mirrorParams,
      );

      await client.query("commit");
      written += chunk.length;
    } catch (error) {
      await client.query("rollback");
      console.error(`  chunk at ${i} failed: ${error.message}`);
    }
    process.stdout.write(`  ${Math.min(i + CHUNK, scored.length)}/${scored.length}\r`);
  }

  // Tiers by rank. Suppressed accounts are excluded from ranking: they are
  // current clients, not prospects, so they must not occupy a Top 25 slot.
  // Locked accounts keep their tier no matter what the rank says.
  await client.query(
    `with ranked as (
       select id, row_number() over (order by latest_score desc nulls last, open_roles_count desc) as rank
         from accounts
        where org_id = $1 and not is_suppressed and not tier_locked
     )
     update accounts a
        set tier = case
              when r.rank <= 25  then 'top25'::portfolio_tier
              when r.rank <= 50  then 'next25'::portfolio_tier
              when r.rank <= 150 then 'watch'::portfolio_tier
              else 'unassigned'::portfolio_tier
            end,
            tier_set_at = now()
       from ranked r
      where a.id = r.id and a.org_id = $1`,
    [orgId],
  );

  await client.query(
    `update agent_runs
        set status = 'complete', items_total = $1, items_ok = $2,
            finished_at = now(),
            duration_ms = extract(epoch from (now() - started_at)) * 1000
      where id = $3`,
    [scored.length, written, runId],
  );

  const { rows: dist } = await client.query(
    `select tier, count(*)::int n, round(avg(latest_score))::int avg_score
       from accounts where org_id = $1 group by tier order by n desc`,
    [orgId],
  );

  console.log(`\nScores written: ${written}`);
  console.log("Tier distribution:");
  for (const d of dist) console.log(`  ${d.tier.padEnd(12)} ${String(d.n).padStart(5)}  avg ${d.avg_score ?? "-"}`);
} catch (error) {
  console.error(`\nScoring failed: ${error.message}`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
