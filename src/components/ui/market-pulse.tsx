import Link from "next/link";

/**
 * Where the demand is, from the roles that clear the bar.
 *
 * Two small bar sets, cities and disciplines, drawn from live top-decile
 * roles only. The bars grow in on load, which is the one animation on the
 * page, and it is there because a bar that is already full reads as a
 * label while a bar that fills reads as a measurement being taken.
 *
 * Every bar is a link into the roles behind it. Nothing here is decoration.
 */
export function MarketPulse({
  cities,
  disciplines,
}: {
  cities: { city: string; n: number }[];
  disciplines: { discipline: string; n: number; avg_age: number }[];
}) {
  const maxCity = Math.max(1, ...cities.map((c) => c.n));
  const maxDisc = Math.max(1, ...disciplines.map((d) => d.n));

  if (cities.length === 0 && disciplines.length === 0) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="placard mb-3 text-[11px] text-[var(--alac-text-2)]">
          Where the hard roles are
        </div>
        <ul className="flex flex-col gap-2">
          {cities.map((c, i) => (
            <li key={c.city}>
              <Link
                href={`/roles?range=month&q=${encodeURIComponent(c.city)}`}
                className="group grid grid-cols-[120px_1fr_32px] items-center gap-3"
                title={`${c.n} top roles in ${c.city}. Open them`}
              >
                <span className="truncate text-[12.5px] text-[var(--alac-text-2)] group-hover:text-[var(--alac-text)]">
                  {c.city}
                </span>
                <span className="h-[8px] overflow-hidden rounded-[3px] bg-[var(--alac-surface-2)]">
                  <span
                    className="pulse-bar block h-full rounded-[3px] bg-[var(--alac-cyan)]"
                    style={{ width: `${(c.n / maxCity) * 100}%`, animationDelay: `${i * 60}ms` }}
                  />
                </span>
                <span className="readout text-right text-[12px] text-[var(--alac-text-3)]">{c.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="placard mb-3 text-[11px] text-[var(--alac-text-2)]">
          What they cannot fill
        </div>
        <ul className="flex flex-col gap-2">
          {disciplines.map((d, i) => (
            <li key={d.discipline}>
              <Link
                href={`/roles?range=month&q=${encodeURIComponent(d.discipline.split(" ")[0])}`}
                className="group grid grid-cols-[150px_1fr_64px] items-center gap-3"
                title={`${d.n} top roles, open ${d.avg_age} days on average. Open them`}
              >
                <span className="truncate text-[12.5px] text-[var(--alac-text-2)] group-hover:text-[var(--alac-text)]">
                  {d.discipline}
                </span>
                <span className="h-[8px] overflow-hidden rounded-[3px] bg-[var(--alac-surface-2)]">
                  <span
                    className="pulse-bar block h-full rounded-[3px] bg-[var(--alac-purple)]"
                    style={{ width: `${(d.n / maxDisc) * 100}%`, animationDelay: `${i * 60}ms` }}
                  />
                </span>
                <span className="readout text-right text-[12px] text-[var(--alac-text-3)]">
                  {d.n} · {d.avg_age}d
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
