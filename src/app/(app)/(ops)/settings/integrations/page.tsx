/** Integrations, what's connected, and what's still needed. */
import { requireAdminPage } from '@/lib/server/ops/context'
import {
  getCalendars, getIntegrations, getPeople,
} from '@/lib/server/ops/queries'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  await requireAdminPage()

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
