import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Integrations: back link, header, connected services. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-5">
      <OpsHeaderSkeleton back />
      <RowsSkeleton rows={5} className="mb-4" />
      <RowsSkeleton rows={3} />
    </div>
  )
}
