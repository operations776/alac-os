import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Notifications: back link, header, one preference panel per group. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-5">
      <OpsHeaderSkeleton back />
      <div className="space-y-4">
        <RowsSkeleton rows={4} />
        <RowsSkeleton rows={3} />
        <RowsSkeleton rows={3} />
      </div>
    </div>
  )
}
