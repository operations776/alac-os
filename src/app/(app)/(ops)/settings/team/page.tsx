/** Team administration, invite, assign roles, manage state. */
import { requireAdminPage } from '@/lib/server/ops/context'
import { getFunctions, getInvitations, getPeople } from '@/lib/server/ops/queries'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const me = await requireAdminPage()

  const [people, functions, invitations] = await Promise.all([
    getPeople(), getFunctions(), getInvitations(),
  ])
  return (
    <TeamClient me={me} people={people} functions={functions}
                invitations={invitations} />
  )
}
