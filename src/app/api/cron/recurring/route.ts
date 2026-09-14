/**
 * Turn recurring templates into actual tasks.
 *
 * Until this existed, `run_due_recurring()` was defined and never called:
 * recurring work only appeared when somebody completed the previous
 * occurrence, so a newly created rule generated nothing at all and a rule
 * whose last task was never ticked off went quiet forever.
 *
 * Safe to run as often as you like. Each occurrence is one row keyed by
 * (recurring_id, due_date) with a unique index behind it, so a second run,
 * or two overlapping ones, cannot produce a duplicate. The function also
 * catches up: a rule dormant for months generates every occurrence it owes
 * in a single call, which matters because Vercel's Hobby plan runs a cron
 * once a day and a missed day must not silently vanish.
 *
 * Vercel Cron calls this with CRON_SECRET as a bearer token. Without the
 * secret set the route refuses rather than running open to the internet.
 */
import { NextResponse } from 'next/server'
import { opsQuery } from '@/lib/server/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [row] = await opsQuery<{ generated: number | null }>(
      'select mc.run_due_recurring() as generated',
    )
    return NextResponse.json({ ok: true, generated: row?.generated ?? 0 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
