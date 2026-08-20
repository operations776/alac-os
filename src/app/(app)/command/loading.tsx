import { HeaderSkeleton, StatsSkeleton, PanelSkeleton, TableSkeleton, Bar } from "@/components/ui/skeleton";

/**
 * The board is the heaviest screen: seven result sets in one query against a
 * remote database. This stands in for its actual layout, header, period chips,
 * seven stats, then the next week table.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} w={i === 0 ? 120 : 74} h={26} />
        ))}
      </div>
      <StatsSkeleton count={7} />
      <Bar w={130} h={15} className="mb-2.5" />
      <TableSkeleton rows={6} cols={7} />
      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <PanelSkeleton rows={6} />
        <PanelSkeleton rows={6} />
      </div>
    </div>
  );
}
