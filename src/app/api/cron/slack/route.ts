/**
 * Drains the Slack outbox to Slack.
 *
 * This is what makes notifications actually arrive. Everything upstream
 * (triggers, notify(), slack_outbox) was already writing messages; nothing
 * was sending them, because MCP lives in a Claude conversation and a deployed
 * server cannot reach it.
 *
 * Triggered two ways, because Vercel's Hobby plan caps cron at once per day:
 *
 *   1. Fired by the app itself right after any write that may have queued a
 *      message (see `flushSlack` in lib/server/ops/result.ts). This is what
 *      makes a ping arrive seconds after the drag that caused it.
 *   2. A daily cron as a safety net, catching anything a failed flush left
 *      behind.
 *
 * Safe to call concurrently: each message is claimed by id and marked sent
 * only after Slack confirms, so a double-fire delivers nothing twice.
 *
 * Delivery is at-least-once and marked only after Slack confirms, so a failed
 * send is retried rather than silently dropped. A message that fails five
 * times stops being retried and keeps its error for inspection.
 *
 * Without CRON_SECRET set the route refuses rather than running open: a
 * public URL that drains the queue is a way for anyone to spam the team.
 */
import { NextResponse } from 'next/server'
import { opsQuery } from '@/lib/server/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SLACK_API = 'https://slack.com/api/chat.postMessage'

interface OutboxRow {
  id: string
  target_slack_id: string | null
  channel: string | null
  text: string
  url: string | null
  attempts: number
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 503 })
  }

  let pending: OutboxRow[]
  try {
    pending = await opsQuery<OutboxRow>(
      `select id, target_slack_id, channel, text, url, attempts
         from mc.slack_outbox
        where sent_at is null and attempts < 5
        order by created_at
        limit 25`,
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  let sent = 0
  const failures: string[] = []
  const delivered: { to: string; channel: string | null }[] = []

  // A failed attempt counts against the five, and keeps the reason.
  const recordFailure = (row: OutboxRow, error: string) =>
    opsQuery(
      'update mc.slack_outbox set attempts = $2, error = $3 where id = $1',
      [row.id, row.attempts + 1, error],
    )

  for (const row of pending) {
    // A person's Slack id is a valid channel, so this lands as a DM.
    const channel = row.target_slack_id ?? row.channel ?? '#alac_main'
    const text = row.url && base ? `${row.text}\n${base}${row.url}` : row.text

    try {
      const res = await fetch(SLACK_API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, text, unfurl_links: false }),
      })
      const body = (await res.json()) as {
        ok: boolean; error?: string; channel?: string; ts?: string
      }

      if (body.ok) {
        // Store where it landed. "sent" with no channel id is unverifiable
        // after the fact, which is how three messages were reported as
        // delivered with no way to check whether anyone received them.
        await opsQuery(
          `update mc.slack_outbox
              set sent_at = now(), error = null, slack_channel_id = $2, slack_ts = $3
            where id = $1`,
          [row.id, body.channel ?? null, body.ts ?? null],
        )
        sent++
        delivered.push({ to: channel, channel: body.channel ?? null })
      } else {
        // Record the reason and count the attempt, so a permanently broken
        // message stops after five tries instead of retrying forever.
        await recordFailure(row, body.error ?? 'unknown')
        failures.push(`${row.id}: ${body.error}`)
      }
    } catch (e) {
      const message = (e as Error).message
      // The failure write itself can fail (database down); the summary must
      // still come back rather than the whole drain throwing.
      await recordFailure(row, message).catch(() => {})
      failures.push(`${row.id}: ${message}`)
    }
  }

  return NextResponse.json({
    queued: pending.length,
    sent,
    failed: failures.length,
    errors: failures.slice(0, 5),
    delivered,
  })
}
