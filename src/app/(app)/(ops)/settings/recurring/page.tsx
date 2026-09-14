/** Recurring work, the things that come back every week or month. */
import { requireAdminPage } from '@/lib/server/ops/context'
import {
  getPeople, getProjects, getRecurring, getSops,
} from '@/lib/server/ops/queries'
import { RecurringClient } from './recurring-client'

export default async function RecurringPage() {
  const me = await requireAdminPage()

  const [rules, people, projects, sops] = await Promise.all([
    getRecurring(), getPeople(), getProjects(), getSops(),
  ])

  return (
    <RecurringClient
      rules={rules}
      people={people}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      sops={sops.map((s) => ({ id: s.id, title: s.title }))}
      me={me}
    />
  )
}
