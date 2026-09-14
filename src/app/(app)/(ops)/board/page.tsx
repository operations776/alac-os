/** The company board, everything the team is doing, in one view. */
import { redirect } from 'next/navigation'
import { getFunctions, getMe, getPeople, getProjects, getTasks } from '@/lib/server/ops/queries'
import { CompanyBoard } from './board-client'

export default async function BoardPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [tasks, projects, people, functions] = await Promise.all([
    getTasks(), getProjects(), getPeople(), getFunctions(),
  ])

  return (
    <CompanyBoard me={me} tasks={tasks} projects={projects}
                  people={people} functions={functions} />
  )
}
