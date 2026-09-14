import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** GTM account: back link, header, work panels beside details and history. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-5">
      <OpsHeaderSkeleton back />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <RowsSkeleton rows={5} />
          <RowsSkeleton rows={4} />
        </div>
        <div className="space-y-4">
          <RowsSkeleton rows={6} />
          <RowsSkeleton rows={4} />
        </div>
      </div>
    </div>
  )
}
