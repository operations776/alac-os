/** Content Analytics, what we actually got out the door. */
import { redirect } from 'next/navigation'
import { getMe, getPeople, getPublications } from '@/lib/server/ops/queries'
import { AnalyticsClient } from './analytics-client'

export default async function ContentAnalyticsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [publications, people] = await Promise.all([
    getPublications(), getPeople(),
  ])

  return <AnalyticsClient me={me} publications={publications} people={people} />
}
