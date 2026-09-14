import { KanbanSkeleton, OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** Content Studio: header and filters, six fixed width status columns. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col p-5">
      <OpsHeaderSkeleton actions={[140, 110, 80, 64, 116]} className="mb-3" />
      <KanbanSkeleton columns={6} columnWidth={240} />
    </div>
  )
}
