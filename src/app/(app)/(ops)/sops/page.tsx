/** SOPs, how the work is actually done. */
import { requireAdminPage } from '@/lib/server/ops/context'
import { getFunctions, getSops } from '@/lib/server/ops/queries'
import { SopsClient } from './sops-client'

export default async function SopsPage() {
  const me = await requireAdminPage()

  const [sops, functions] = await Promise.all([getSops(), getFunctions()])

  return <SopsClient sops={sops} functions={functions} me={me} />
}
