/** SOPs, how the work is actually done. */
import { redirect } from 'next/navigation'
import { getFunctions, getMe, getSops } from '@/lib/server/ops/queries'
import { SopsClient } from './sops-client'

export default async function SopsPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [sops, functions] = await Promise.all([getSops(), getFunctions()])

  return <SopsClient sops={sops} functions={functions} me={me} />
}
