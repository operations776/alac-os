import { Bar } from '@/components/ui/skeleton'
import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Archive: header, search and filters, archived items. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[224, 100, 110, 100, 100].map((w, i) => <Bar key={i} w={w} h={28} />)}
      </div>
      <RowsSkeleton rows={10} title={false} />
    </div>
  )
}
