import { PanelSkeleton, Bar } from "@/components/ui/skeleton";

/**
 * The account page. Two columns, and the right hand score card is a fixed
 * width, so the skeleton mirrors that or the header jumps sideways when the
 * real one arrives.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <Bar w={130} h={40} className="mb-4" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <Bar w="40%" h={30} />
          <div className="mt-3 flex gap-2">
            <Bar w={86} h={24} />
            <Bar w={96} h={24} />
            <Bar w={110} h={24} />
          </div>
          <Bar w={150} h={12} className="mt-3" />
        </div>
        <div className="w-[196px] rounded-[var(--alac-radius-lg)] bg-[var(--alac-surface)] px-5 pb-5 pt-4">
          <Bar w={92} h={11} />
          <Bar w={110} h={40} className="mt-2.5" />
          <Bar w="86%" h={11} className="mt-3" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-5">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={5} />
        </div>
        <div className="flex flex-col gap-5">
          <PanelSkeleton rows={4} />
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
