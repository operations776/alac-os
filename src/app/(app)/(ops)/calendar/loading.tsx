import { Bar } from '@/components/ui/skeleton'
import { OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** Calendar: header and month controls, a seven by five month grid. */
export default function Loading() {
  return (
    <div className="p-5">
      <OpsHeaderSkeleton actions={[80, 96, 28, 60, 28]} className="mb-3" />
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex justify-center px-2 py-1.5"><Bar w={24} h={10} /></div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-32 border-b border-r border-[var(--border)] p-1.5">
              <Bar w={20} h={20} />
              {i % 4 === 1 && <Bar w="80%" h={12} className="mt-1.5" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
