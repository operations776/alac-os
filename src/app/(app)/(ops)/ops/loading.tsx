import { OpsHeaderSkeleton, RowsSkeleton, StatTilesSkeleton } from '@/components/ops/ui/skeletons'

/** Command center: greeting, four stat tiles, task groups beside the projects and load panels. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-5">
      <OpsHeaderSkeleton className="mb-5" />
      <StatTilesSkeleton className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <RowsSkeleton rows={4} />
          <RowsSkeleton rows={3} />
        </div>
        <div className="space-y-3">
          <RowsSkeleton rows={6} />
          <RowsSkeleton rows={5} />
        </div>
      </div>
    </div>
  )
}
