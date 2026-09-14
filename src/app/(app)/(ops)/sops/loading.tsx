import { Bar } from '@/components/ui/skeleton'
import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** SOPs: header, search and function chips, the SOP list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl p-5">
      <OpsHeaderSkeleton />
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Bar h={32} className="min-w-52 flex-1" />
        {[70, 90, 80, 100].map((w, i) => <Bar key={i} w={w} h={26} />)}
      </div>
      <RowsSkeleton rows={8} title={false} />
    </div>
  )
}
