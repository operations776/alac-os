import { OpsHeaderSkeleton, RowsSkeleton, StatTilesSkeleton } from '@/components/ops/ui/skeletons'

/** GTM Analytics: header, four tiles, outcome panels. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton actions={[96]} />
      <StatTilesSkeleton className="mb-4 grid grid-cols-4 gap-3" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <RowsSkeleton rows={5} className="col-span-2" />
        <RowsSkeleton rows={5} />
      </div>
      <RowsSkeleton rows={6} />
    </div>
  )
}
