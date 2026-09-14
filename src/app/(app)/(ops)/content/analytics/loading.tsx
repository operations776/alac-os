import { OpsHeaderSkeleton, RowsSkeleton, StatTilesSkeleton } from '@/components/ops/ui/skeletons'

/** Content Analytics: header, four volume tiles, seven performance tiles, two panels. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton actions={[110, 120]} />
      <StatTilesSkeleton className="mb-3 grid grid-cols-4 gap-3" />
      <StatTilesSkeleton count={7} className="mb-4 grid grid-cols-7 gap-2" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <RowsSkeleton rows={6} className="col-span-2" />
        <RowsSkeleton rows={6} />
      </div>
    </div>
  )
}
