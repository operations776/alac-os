/** One GTM account: research, decision makers, outreach, review. */
import { notFound, redirect } from 'next/navigation'
import {
  getActivity, getGtmAccount, getGtmContacts, getMe, getOutreachDrafts, getPeople,
} from '@/lib/server/ops/queries'
import { AccountClient } from './account-client'

export default async function GtmAccountPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getMe()
  if (!me) redirect('/signin')

  const account = await getGtmAccount(id)
  if (!account) notFound()

  const [contacts, drafts, people, activity] = await Promise.all([
    getGtmContacts(id), getOutreachDrafts(id), getPeople(),
    getActivity('gtm_account', id),
  ])

  return (
    <AccountClient
      me={me}
      account={account}
      contacts={contacts}
      drafts={drafts}
      people={people}
      activity={activity}
    />
  )
}
