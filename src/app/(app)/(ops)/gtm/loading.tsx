import { KanbanSkeleton, OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** GTM Execution: header and filters, seven fixed width stage columns. */
export default function Loading() {
  return (
    <div className="flex h-full flex-col p-5">
      <OpsHeaderSkeleton actions={[96, 190, 64, 116]} className="mb-3" />
      <KanbanSkeleton columns={7} columnWidth={224} />
    </div>
  )
}
