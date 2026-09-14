/** Archive, everything finished, preserved and searchable (spec §8). */
import { redirect } from 'next/navigation'
import { getArchive, getFunctions, getMe, getPeople } from '@/lib/server/ops/queries'
import { ArchiveClient } from './archive-client'

export default async function ArchivePage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [items, people, functions] = await Promise.all([
    getArchive(), getPeople(), getFunctions(),
  ])

  return <ArchiveClient me={me} items={items} people={people} functions={functions} />
}
