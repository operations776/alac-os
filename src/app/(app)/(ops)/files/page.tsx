/** Files, the ALAC Google Drive, indexed. */
import { requireAdminPage } from '@/lib/server/ops/context'
import { getDriveFiles, getIntegrations, getProjects } from '@/lib/server/ops/queries'
import { FilesClient } from './files-client'

export default async function FilesPage() {
  await requireAdminPage()

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
