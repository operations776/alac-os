/** Files, the ALAC Google Drive, indexed. */
import { redirect } from 'next/navigation'
import { getDriveFiles, getIntegrations, getMe, getProjects } from '@/lib/server/ops/queries'
import { FilesClient } from './files-client'

export default async function FilesPage() {
  const me = await getMe()
  if (!me) redirect('/signin')

  const [files, projects, integrations] = await Promise.all([
    getDriveFiles(), getProjects(), getIntegrations(),
  ])

  return (
    <FilesClient
      files={files}
      projects={projects}
      drive={integrations.find((i) => i.key === 'drive') ?? null}
    />
  )
}
