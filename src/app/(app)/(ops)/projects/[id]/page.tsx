/** One project: its tasks, on a board or a list, plus search delivery if set. */
import { notFound, redirect } from 'next/navigation'
import {
  getClients, getDriveFiles, getFunctions, getMe, getPeople, getProject,
  getProjects, getTasks,
} from '@/lib/server/ops/queries'
import { ProjectClient } from './project-client'

export default async function ProjectPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getMe()
  if (!me) redirect('/signin')

  const project = await getProject(id)
  if (!project) notFound()

  const [tasks, people, clients, allProjects, files, functions] = await Promise.all([
    getTasks({ projectId: id }), getPeople(), getClients(), getProjects(),
    getDriveFiles(id), getFunctions(),
  ])

  return (
    <ProjectClient
      project={project}
      tasks={tasks}
      people={people}
      clients={clients}
      projects={allProjects.map((p) => ({ id: p.id, name: p.name }))}
      files={files}
      functions={functions}
      canDelete={me.is_admin}
    />
  )
}
