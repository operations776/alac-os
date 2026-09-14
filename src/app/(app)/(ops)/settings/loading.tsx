import { FormPanelSkeleton, OpsHeaderSkeleton } from '@/components/ops/ui/skeletons'

/** Settings: title, the profile form, the password form. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-5">
      <OpsHeaderSkeleton sub={false} />
      <FormPanelSkeleton fields={4} className="mb-4" />
      <FormPanelSkeleton fields={3} className="mb-4" />
    </div>
  )
}
