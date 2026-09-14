import { Bar } from '@/components/ui/skeleton'
import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Files: header, search and project filter, folders then files. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl p-5">
      <OpsHeaderSkeleton />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Bar w={192} h={28} />
        <Bar w={140} h={28} />
      </div>
      <div className="space-y-4">
        <div>
          <Bar w={60} h={10} className="mb-1.5" />
          <RowsSkeleton rows={3} title={false} />
        </div>
        <div>
          <Bar w={60} h={10} className="mb-1.5" />
          <RowsSkeleton rows={8} title={false} />
        </div>
      </div>
    </div>
  )
}
