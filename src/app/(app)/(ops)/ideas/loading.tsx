import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Ideas: header with filter and add, the idea list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <OpsHeaderSkeleton actions={[90, 84]} className="" />
      <RowsSkeleton rows={6} title={false} />
    </div>
  )
}
