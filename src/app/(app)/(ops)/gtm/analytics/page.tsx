/** GTM Analytics, what the GTM team actually produced. */
import { redirect } from 'next/navigation'
import { getGtmAccounts, getMe, getPeople } from '@/lib/server/ops/queries'
import { GtmAnalyticsClient } from './analytics-client'

export default async function GtmAnalyticsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  // history: every account, including completed campaigns.
  const [accounts, people] = await Promise.all([
    getGtmAccounts(true), getPeople(),
  ])

  return <GtmAnalyticsClient me={me} accounts={accounts} people={people} />
}
