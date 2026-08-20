import { HeaderSkeleton, StatsSkeleton, Bar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      <StatsSkeleton count={4} />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <Bar w="42%" h={18} />
              <Bar w="88%" h={13} className="mt-3" />
              <Bar w="74%" h={13} className="mt-1.5" />
              <div className="mt-3 flex gap-2">
                <Bar w={70} h={24} />
                <Bar w={104} h={24} />
              </div>
            </div>
            <div className="well px-4 py-3.5">
              <Bar w="52%" h={11} />
              <Bar w={78} h={24} className="mt-3" />
              <div className="mt-4 flex flex-col gap-2.5">
                {Array.from({ length: 6 }, (_, j) => (
                  <Bar key={j} h={9} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
