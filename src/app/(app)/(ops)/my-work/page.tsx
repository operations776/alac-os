/** My Work, one person's list. */
import { redirect } from 'next/navigation'
import { getMe, getPeople, getProjects, getTasks } from '@/lib/server/ops/queries'
import { MyWorkClient } from './my-work-client'

export default async function MyWorkPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [tasks, people, projects] = await Promise.all([
    getTasks(), getPeople(), getProjects(),
  ])

  return (
    <MyWorkClient
      me={me}
      tasks={tasks}
      people={people}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
    />
  )
}
