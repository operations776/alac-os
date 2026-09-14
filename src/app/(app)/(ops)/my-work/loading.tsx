import { Bar } from '@/components/ui/skeleton'
import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** My Work: header with the person picker, five tabs, task groups. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl p-5">
      <OpsHeaderSkeleton actions={[96]} />
      <div className="mb-4 flex gap-4 border-b border-[var(--border)] px-3 pb-2.5 pt-1">
        {[36, 40, 56, 40, 36].map((w, i) => <Bar key={i} w={w} h={12} />)}
      </div>
      <div className="space-y-3">
        <RowsSkeleton rows={4} />
        <RowsSkeleton rows={3} />
      </div>
    </div>
  )
}
