import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Pending review: header, a stack of review cards. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton />
      <div className="space-y-4">
        <RowsSkeleton rows={3} />
        <RowsSkeleton rows={3} />
        <RowsSkeleton rows={3} />
      </div>
    </div>
  )
}
