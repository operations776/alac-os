/** The founder review gate (spec §57). Approve, hold, or decline. */
import { redirect } from 'next/navigation'
import { getMe, getPendingReview } from '@/lib/server/ops/queries'
import { ReviewClient } from './review-client'

export default async function GtmReviewPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const accounts = await getPendingReview()
  return <ReviewClient me={me} accounts={accounts} />
}
