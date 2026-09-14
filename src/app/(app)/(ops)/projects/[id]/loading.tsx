import { Bar } from '@/components/ui/skeleton'
import { KanbanSkeleton } from '@/components/ops/ui/skeletons'

/** Project detail: the header band, the board or list toggle, five status columns. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <Bar w={60} h={10} className="mb-2" />
        <Bar w={240} h={22} />
        <Bar w="48%" h={12} className="mt-2" />
        <div className="mt-3 flex flex-wrap gap-4">
          {[110, 90, 130, 100].map((w, i) => <Bar key={i} w={w} h={12} />)}
        </div>
      </div>
      <div className="flex-1 p-5">
        <div className="mb-3 flex justify-end">
          <Bar w={128} h={28} />
        </div>
        <div className="h-[calc(100vh-24rem)] min-h-96">
          <KanbanSkeleton columns={5} />
        </div>
      </div>
    </div>
  )
}
