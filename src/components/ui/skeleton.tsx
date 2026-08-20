/**
 * Loading skeletons.
 *
 * These exist because every screen here is server rendered against a database
 * in another region, so there is a real gap between a click and content. A
 * blank page during that gap reads as broken; a skeleton in the shape of the
 * answer reads as loading.
 *
 * The rule they follow: a skeleton must match the LAYOUT of what replaces it.
 * A skeleton that is the wrong shape causes the page to jump when real content
 * arrives, which is worse than no skeleton at all, because the eye has already
 * started reading the wrong place.
 *
 * They are deliberately dumb, no props beyond count, because a skeleton that
 * needs configuring is a skeleton that will drift out of sync with the thing
 * it stands in for.
 */

/** The shimmer block everything else is built from. */
export function Bar({
  w = "100%",
  h = 14,
  className = "",
}: {
  w?: string | number;
  h?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton block rounded-[var(--alac-radius-sm)] ${className}`}
      style={{ width: typeof w === "number" ? `${w}px` : w, height: h }}
    />
  );
}

/**
 * A page header: eyebrow, title, lede. Matches PageHeader's spacing so the
 * real header lands exactly where the skeleton was.
 */
export function HeaderSkeleton() {
  return (
    <div className="mb-7">
      <Bar w={110} h={11} />
      <Bar w="46%" h={30} className="mt-2.5" />
      <Bar w="72%" h={13} className="mt-3" />
    </div>
  );
}

/** A row of stat cards. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel px-5 py-4">
          <Bar w={72} h={10} />
          <Bar w={54} h={26} className="mt-2.5" />
        </div>
      ))}
    </div>
  );
}

/** A table, header row plus body rows. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex gap-4 bg-[var(--alac-ground)] px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Bar key={i} w={i === 1 ? "22%" : "10%"} h={10} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-[var(--alac-line)] px-4 py-3 last:border-0"
        >
          {Array.from({ length: cols }, (_, i) => (
            <Bar key={i} w={i === 1 ? "22%" : "10%"} h={13} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The account cards on the targets board. */
export function CardListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel px-5 py-4">
          <div className="flex items-baseline gap-4">
            <Bar w={20} h={15} />
            <Bar w="30%" h={17} />
            <span className="ml-auto flex gap-2">
              <Bar w={78} h={22} />
              <Bar w={62} h={22} />
            </span>
          </div>
          <Bar w="64%" h={12} className="mt-3 ml-11" />
          <div className="ml-11 mt-3 flex gap-5">
            <Bar w={110} h={11} />
            <Bar w={130} h={11} />
            <Bar w={150} h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A panel with a heading and a list inside it. */
export function PanelSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="panel">
      {title ? (
        <div className="px-5 pb-3 pt-4">
          <Bar w="34%" h={15} />
          <Bar w="52%" h={11} className="mt-2" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1 px-3 pb-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Bar w={26} h={13} />
            <Bar w={`${28 + ((i * 7) % 22)}%`} h={13} />
            <Bar w={90} h={11} className="ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
