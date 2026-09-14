/** Integrations, what's connected, and what's still needed. */
import { redirect } from 'next/navigation'
import {
  getCalendars, getIntegrations, getMe, getPeople,
} from '@/lib/server/ops/queries'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [integrations, calendars, people] = await Promise.all([
    getIntegrations(), getCalendars(), getPeople(),
  ])

  return (
    <IntegrationsClient
      integrations={integrations}
      calendars={calendars}
      people={people}
    />
  )
}
