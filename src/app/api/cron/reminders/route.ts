/**
 * Send due reminders: tasks due soon, due today and overdue, GTM next actions,
 * requisitions waiting on their owner, content past its publish date.
 *
 * The rules live in `mc.run_reminders()`, so this daily cron and the
 * opportunistic run on page load (`run_reminders_if_due`, from the team bar)
 * share one definition. Each reminder is one row in `mc.reminder_log` keyed by
 * person, entity, rule and day, so a second run, or two overlapping ones,
 * sends nothing twice.
 *
 * Vercel Cron calls this with CRON_SECRET as a bearer token. Without the
 * secret set the route refuses rather than running open to the internet.
 */
import { NextResponse } from 'next/server'
import { opsQuery } from '@/lib/server/db'
import { flushSlack } from '@/lib/server/ops/result'

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
    const [row] = await opsQuery<{ sent: number | null }>('select mc.run_reminders() as sent')
    await flushSlack()
    return NextResponse.json({ ok: true, sent: row?.sent ?? 0 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
