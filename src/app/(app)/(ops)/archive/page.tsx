/** Archive, everything finished, preserved and searchable (spec §8). */
import { requireAdminPage } from '@/lib/server/ops/context'
import { getArchive, getFunctions, getPeople } from '@/lib/server/ops/queries'
import { ArchiveClient } from './archive-client'

export default async function ArchivePage() {
  const me = await requireAdminPage()

  const [items, people, functions] = await Promise.all([
    getArchive(), getPeople(), getFunctions(),
  ])

  return <ArchiveClient me={me} items={items} people={people} functions={functions} />
}
