/** Settings. Your profile, the team, and the client list. */
import { redirect } from 'next/navigation'
import { getMe, getPeople } from '@/lib/server/ops/queries'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const people = await getPeople()
  return <SettingsClient me={me} people={people} />
}
