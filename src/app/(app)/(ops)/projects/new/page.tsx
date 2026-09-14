/** New project. */
import { redirect } from 'next/navigation'
import { getClients, getMe, getPeople } from '@/lib/server/ops/queries'
import { NewProjectForm } from './new-project-form'

export default async function NewProjectPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [people, clients] = await Promise.all([getPeople(), getClients()])
  return <NewProjectForm people={people} me={me} />
}
