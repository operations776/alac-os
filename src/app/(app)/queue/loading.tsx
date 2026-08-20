import { HeaderSkeleton, TableSkeleton, Bar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      {/* The filter bar, which is tall enough to shift the table if it is
          not accounted for. */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Bar w={280} h={40} />
        <Bar w={150} h={40} />
        <Bar w={150} h={40} />
        <Bar w={150} h={40} />
        <Bar w={130} h={40} />
      </div>
      <TableSkeleton rows={12} cols={8} />
    </div>
  );
}
