/**
 * Tier proposals. The engine proposes, a human decides.
 *
 *   node scripts/propose.mjs              write pending recommendations
 *   node scripts/propose.mjs --dry-run    show what would be proposed
 *
 * Ranks non-suppressed accounts by their latest score: 1-25 Top, 26-50 Next,
 * 51-150 Watch. Where the proposed tier differs from the stored one, that
 * difference becomes a recommendations row. It never writes accounts.tier
 * directly. ARCHITECTURE.md section 5.
 *
 * Two guards keep the queue worth reading:
 *
 *   Hysteresis. A demotion needs the account to have fallen 8+ points or 10+
 *   rank positions past the boundary. Without it, an account sitting at rank
 *   25 proposes a change every single week and Adrian learns to ignore the
 *   queue entirely. A queue nobody trusts is worse than no queue.
 *
 *   tier_locked. A human pin. The engine may not demote a locked account,
 *   though it may still propose promoting one.
 */
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local', quiet: true })

const DRY_RUN = process.argv.includes('--dry-run')

const TOP_END = 25
const NEXT_END = 50
const WATCH_END = 150

const DEMOTE_POINT_DROP = 8
const DEMOTE_RANK_DROP = 10

/** Rank to the tier that rank implies. Null means outside the portfolio. */
function tierForRank(rank) {
  if (rank <= TOP_END) return 'top25'
  if (rank <= NEXT_END) return 'next25'
  if (rank <= WATCH_END) return 'watch'
  return null
}

const RANKS = { top25: 3, next25: 2, watch: 1 }

// Enum values are storage, not English. The rationale is read by a person, so
// it gets the label rather than the database spelling.
const TIER_LABEL = {
  top25: 'the Top 25',
  next25: 'the Next 25',
  watch: 'the Watch list',
  unassigned: 'no tier',
  removed: 'removed',
}
const label = (t) => TIER_LABEL[t] ?? 'no tier'

/** Positive when `to` is better than `from`. */
function direction(from, to) {
  return (RANKS[to] ?? 0) - (RANKS[from] ?? 0)
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
  })
  await client.connect()

  try {
    const {
      rows: [org],
    } = await client.query('select id from orgs order by created_at limit 1')
    const orgId = org.id

    // Latest score per account, ranked. Suppressed accounts are current
    // clients rather than prospects, so they never occupy a portfolio slot.
    const { rows: ranked } = await client.query(
      `
      with latest as (
        select distinct on (account_id)
               account_id, id as score_id, score, scored_at
          from account_scores
         where org_id = $1
         order by account_id, scored_at desc
      ),
      prev as (
        select distinct on (s.account_id) s.account_id, s.score as prev_score
          from account_scores s
          join latest l on l.account_id = s.account_id
         where s.org_id = $1 and s.scored_at < l.scored_at
         order by s.account_id, s.scored_at desc
      )
      select a.id, a.company_name, a.tier, a.tier_locked,
             l.score_id, l.score, p.prev_score,
             row_number() over (order by l.score desc, a.company_name) as rank
        from accounts a
        join latest l on l.account_id = a.id
        left join prev p on p.account_id = a.id
       where a.org_id = $1 and not a.is_suppressed
       order by rank
      `,
      [orgId],
    )

    console.log(`\nRanked ${ranked.length} non-suppressed accounts`)

    const proposals = []
    let heldByHysteresis = 0
    let heldByLock = 0

    for (const r of ranked) {
      const rank = Number(r.rank)
      const proposed = tierForRank(rank)
      const current = r.tier

      // 'unassigned' is the stored spelling of "not in the portfolio", and
      // most of the 8,000-row universe sits there. Treat it as equivalent to
      // null so the engine does not propose demoting the entire long tail.
      const currentNorm = current === 'unassigned' ? null : current
      if (proposed === currentNorm) continue
      if (proposed === null && currentNorm === null) continue

      const dir = direction(currentNorm, proposed)

      if (dir < 0) {
        // A demotion. Both guards apply.
        if (r.tier_locked) {
          heldByLock++
          continue
        }
        const pointDrop =
          r.prev_score === null ? null : Number(r.prev_score) - Number(r.score)
        const clearsPoints =
          pointDrop !== null && pointDrop >= DEMOTE_POINT_DROP

        // Rank distance past the boundary it fell out of.
        const boundary =
          currentNorm === 'top25'
            ? TOP_END
            : currentNorm === 'next25'
              ? NEXT_END
              : WATCH_END
        const clearsRank = rank - boundary >= DEMOTE_RANK_DROP

        if (!clearsPoints && !clearsRank) {
          heldByHysteresis++
          continue
        }
      }

      // The schema requires both tiers on a tier change, so "out of the
      // portfolio" is written as its explicit enum value rather than null.
      proposals.push({
        account_id: r.id,
        company: r.company_name,
        score_id: r.score_id,
        from_tier: currentNorm ?? 'unassigned',
        to_tier: proposed ?? 'unassigned',
        rank,
        score: Number(r.score),
        kind: dir > 0 ? 'promote_tier' : 'demote_tier',
      })
    }

    const promotions = proposals.filter((p) => p.kind === 'promote_tier')
    const demotions = proposals.filter((p) => p.kind === 'demote_tier')

    console.log(`  ${promotions.length} promotions, ${demotions.length} demotions`)
    console.log(`  ${heldByHysteresis} demotions held back by hysteresis`)
    console.log(`  ${heldByLock} held back by tier_locked\n`)

    for (const p of proposals.slice(0, 20)) {
      const arrow = p.kind === 'promote_tier' ? 'up  ' : 'down'
      console.log(
        `  ${arrow} ${String(p.rank).padStart(3)}  ${p.company.slice(0, 38).padEnd(38)} ` +
          `${String(p.from_tier ?? 'none').padEnd(7)} -> ${p.to_tier ?? 'none'}  (${p.score})`,
      )
    }
    if (proposals.length > 20) {
      console.log(`  ... and ${proposals.length - 20} more`)
    }

    if (DRY_RUN) {
      console.log('\nDry run. Nothing written.\n')
      return
    }

    if (!proposals.length) {
      console.log('Nothing to propose.\n')
      return
    }

    // One transaction: the run row and every recommendation land together or
    // not at all. Data law 1.
    await client.query('begin')
    try {
      const {
        rows: [run],
      } = await client.query(
        `insert into agent_runs (org_id, kind, trigger, params, items_total, status,
                                 finished_at, duration_ms)
         values ($1, 'recommend', 'manual', $2::jsonb, $3, 'complete', now(), 0)
         returning id`,
        [
          orgId,
          JSON.stringify({
            ranked: ranked.length,
            held_hysteresis: heldByHysteresis,
            held_locked: heldByLock,
          }),
          proposals.length,
        ],
      )

      let written = 0
      for (const p of proposals) {
        const headline =
          p.kind === 'promote_tier'
            ? `Move ${p.company} up to ${label(p.to_tier)}`
            : `Move ${p.company} down to ${label(p.to_tier)}`
        const rationale =
          `Ranked ${p.rank} of ${ranked.length} by deterministic score (${p.score}/100), ` +
          `which places it in ${label(p.to_tier)}. It currently sits in ${label(p.from_tier)}.`

        // Data law 2: the partial unique index is the race guard. A pending
        // recommendation of this kind already existing means the queue already
        // says this, so leave the human's copy alone rather than churning it.
        const res = await client.query(
          `insert into recommendations
             (org_id, account_id, score_id, agent_run_id, kind, from_tier, to_tier,
              headline, rationale, evidence, confidence)
           values ($1,$2,$3,$4,$5::recommendation_kind,$6::portfolio_tier,$7::portfolio_tier,$8,$9,$10::jsonb,$11)
           on conflict (org_id, account_id, kind) where status = 'pending'
           do nothing
           returning id`,
          [
            orgId,
            p.account_id,
            p.score_id,
            run.id,
            p.kind,
            p.from_tier,
            p.to_tier,
            headline,
            rationale,
            JSON.stringify({ rank: p.rank, score: p.score, of: ranked.length }),
            0.9,
          ],
        )
        if (res.rows.length) written++
      }

      await client.query(
        'update agent_runs set items_ok = $1, items_failed = $2 where id = $3',
        [written, proposals.length - written, run.id],
      )
      await client.query('commit')

      console.log(
        `\n  ${written} recommendations written, ` +
          `${proposals.length - written} already pending in the queue\n`,
      )
    } catch (e) {
      await client.query('rollback')
      throw e
    }
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
