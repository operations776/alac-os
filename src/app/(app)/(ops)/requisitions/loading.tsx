import { OpsHeaderSkeleton, RowsSkeleton, StatTilesSkeleton } from '@/components/ops/ui/skeletons'

/** Requisitions: header, four portfolio tiles, the searches table. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton actions={[128]} />
      <StatTilesSkeleton className="mb-4 grid grid-cols-4 gap-3" />
      <RowsSkeleton rows={8} />
    </div>
  )
}
