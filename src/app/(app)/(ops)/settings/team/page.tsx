/** Team administration, invite, assign roles, manage state. */
import { redirect } from 'next/navigation'
import { getFunctions, getInvitations, getMe, getPeople } from '@/lib/server/ops/queries'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [people, functions, invitations] = await Promise.all([
    getPeople(), getFunctions(), getInvitations(),
  ])
  return (
    <TeamClient me={me} people={people} functions={functions}
                invitations={invitations} />
  )
}
