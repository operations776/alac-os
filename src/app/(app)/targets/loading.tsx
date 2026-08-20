import { HeaderSkeleton, StatsSkeleton, CardListSkeleton, Bar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      <StatsSkeleton count={4} />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Bar key={i} w={112} h={26} />
        ))}
      </div>
      <CardListSkeleton count={6} />
    </div>
  );
}
