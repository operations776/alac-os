import { OpsHeaderSkeleton, RowsSkeleton } from '@/components/ops/ui/skeletons'

/** Team: back link, header with the invite action, the people list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-5">
      <OpsHeaderSkeleton back actions={[110]} />
      <RowsSkeleton rows={6} />
    </div>
  )
}
