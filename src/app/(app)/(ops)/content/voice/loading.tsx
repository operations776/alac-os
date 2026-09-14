import { FormPanelSkeleton, OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** Voice: back link, header, the five field profile form. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-5">
      <OpsHeaderSkeleton back />
      <FormPanelSkeleton fields={5} />
    </div>
  )
}
