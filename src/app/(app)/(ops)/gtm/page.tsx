/** GTM Execution, the human workflow after an account is identified. */
import { redirect } from 'next/navigation'
import { getGtmAccounts, getMe, getPeople } from '@/lib/server/ops/queries'
import { GtmClient } from './gtm-client'

export default async function GtmPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [accounts, people] = await Promise.all([getGtmAccounts(), getPeople()])
  return <GtmClient me={me} accounts={accounts} people={people} />
}
