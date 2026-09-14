/** Recurring work, the things that come back every week or month. */
import { redirect } from 'next/navigation'
import {
  getMe, getPeople, getProjects, getRecurring, getSops,
} from '@/lib/server/ops/queries'
import { RecurringClient } from './recurring-client'

export default async function RecurringPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

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
