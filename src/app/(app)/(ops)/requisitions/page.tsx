/** Requisition Intelligence, is this search worth our time? (spec §12-35) */
import { redirect } from 'next/navigation'
import { getMe, getPeople, getReqPortfolio, getRequisitions } from '@/lib/server/ops/queries'
import { RequisitionsClient } from './requisitions-client'

export default async function RequisitionsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [reqs, portfolio, people] = await Promise.all([
    getRequisitions(), getReqPortfolio(), getPeople(),
  ])

  return <RequisitionsClient me={me} reqs={reqs} portfolio={portfolio} people={people} />
}
