import { HeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <HeaderSkeleton />
      <TableSkeleton rows={12} cols={5} />
    </div>
  );
}
