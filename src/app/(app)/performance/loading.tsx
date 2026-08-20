import { HeaderSkeleton, StatsSkeleton, PanelSkeleton, Bar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bar key={i} w={82} h={26} />
        ))}
      </div>
      <StatsSkeleton count={8} />
      <PanelSkeleton rows={4} />
    </div>
  );
}
