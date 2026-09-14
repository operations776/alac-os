/** One GTM account: research, decision makers, outreach, review. */
import { notFound, redirect } from 'next/navigation'
import {
  getActivity, getGtmAccount, getGtmContacts, getMe, getOutreachDrafts, getPeople,
} from '@/lib/server/ops/queries'
import { AccountClient } from './account-client'

// Drafting a prospect's three emails takes up to two model calls, and Draft all
// runs them one after another, well past the default function limit.
export const maxDuration = 300

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
