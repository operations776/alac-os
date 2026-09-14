/**
 * Dashboard.
 *
 * Four questions, answered above the fold: what's late, what's due today,
 * what's stuck, and which projects are in trouble. Everything else is a link.
 */
import { redirect } from 'next/navigation'
import {
  getMe, getPeople, getProjects, getRallyLine, getTasks,
} from '@/lib/server/ops/queries'
import { DashboardClient } from './dashboard-client'

export default async function Dashboard() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [tasks, projects, people, rally] = await Promise.all([
    getTasks(), getProjects(), getPeople(), getRallyLine(),
  ])

  return (
    <DashboardClient
      me={me}
      tasks={tasks}
      projects={projects}
      people={people}
      rally={rally}
    />
  )
}
