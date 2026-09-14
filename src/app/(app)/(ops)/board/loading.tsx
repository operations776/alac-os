import { Bar } from '@/components/ui/skeleton'
import { KanbanSkeleton, OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** Company Board: header and controls, the function chips, five status columns. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col p-5">
      <OpsHeaderSkeleton actions={[96, 330, 64, 100]} className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[104, 92, 80, 110, 88, 96].map((w, i) => <Bar key={i} w={w} h={26} />)}
      </div>
      <KanbanSkeleton columns={5} />
    </div>
  )
}
