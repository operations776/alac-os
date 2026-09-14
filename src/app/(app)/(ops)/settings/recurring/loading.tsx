import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Recurring work: header with the new rule action, the rule list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-5">
      <OpsHeaderSkeleton actions={[120]} />
      <RowsSkeleton rows={6} title={false} />
    </div>
  )
}
