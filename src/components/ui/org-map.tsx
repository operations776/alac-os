import { LANES, CONNECTOR, TOUCH, nextLane } from "@/lib/scoring/personas.mjs";
import { setTouch } from "@/app/(app)/queue/[id]/org";
import { NoticeLine } from "./primitives";

export type Touch = {
  lane: string;
  status: string;
  person: string | null;
  channel: string | null;
  outcome: string | null;
  touched_at: string | null;
};

export type LanePerson = { lane: string | null; full_name: string; title: string | null };

/** The lanes as this file reads them. The connector has no title regex: it is
 *  a route rather than a level, so it is never matched from a title. */
type Lane = { key: string; label: string; hint: string };
const ROWS: Lane[] = [...(LANES as Lane[])].reverse().concat([CONNECTOR as Lane]);

const TONE: Record<string, string> = {
  Untouched: "text-[var(--alac-text-3)]",
  Attempted: "text-[var(--alac-warn)]",
  Engaged: "text-[var(--alac-good)]",
  Closed: "text-[var(--alac-text-3)]",
  Available: "text-[var(--alac-text-3)]",
  Asked: "text-[var(--alac-warn)]",
  Introduced: "text-[var(--alac-good)]",
  Declined: "text-[var(--alac-red-text)]",
};

/**
 * The touch map, section 14.
 *
 * Six levels, tracked apart from each other, because the recommendation the
 * brief describes only exists if they are: a CEO attempted twice with no
 * reply, engineering roles live, technical leadership never contacted, means
 * the VP of Engineering is the next door. One "contacted" flag cannot say
 * that.
 */
export function OrgMap({
  accountId,
  touches,
  people,
  freshRoles,
  roleTitles,
}: {
  accountId: string;
  touches: Touch[];
  people: LanePerson[];
  freshRoles: number;
  roleTitles: string[];
}) {
  const byLane = new Map<string, Touch>(touches.map((t) => [t.lane, t]));
  const counts = new Map<string, LanePerson[]>();
  for (const p of people) {
    if (!p.lane) continue;
    counts.set(p.lane, [...(counts.get(p.lane) ?? []), p]);
  }

  const lanes: Record<string, { status: string; people: number }> = Object.fromEntries(
    ROWS.map((l) => [
      l.key,
      { status: byLane.get(l.key)?.status ?? "Untouched", people: counts.get(l.key)?.length ?? 0 },
    ]),
  );
  // nextLane comes from an untyped .mjs module, so the argument and the
  // result are both stated here rather than inferred from a default.
  const next = (nextLane as (a: {
    lanes: Record<string, { status: string; people: number }>;
    freshRoles: number;
    roleTitles: string[];
  }) => { lane: string; label: string; why: string } | null)({ lanes, freshRoles, roleTitles });

  // Executive at the top, reading down the organization, with the connector
  // last because it is a route rather than a level.
  const rows = ROWS;

  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      {next ? (
        <NoticeLine>
          Next door: <strong className="text-[var(--alac-text)]">{next.label}</strong>. {next.why}
        </NoticeLine>
      ) : null}

      <ul className="flex flex-col gap-1">
        {rows.map((lane) => {
          const t = byLane.get(lane.key);
          const status = t?.status ?? (lane.key === "connector" ? "Available" : "Untouched");
          const known = counts.get(lane.key) ?? [];
          const options = lane.key === "connector"
            ? ["Available", "Asked", "Introduced", "Declined"]
            : TOUCH;

          return (
            <li
              key={lane.key}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--alac-radius)] px-3 py-2.5 odd:bg-[var(--alac-surface-2)]"
            >
              <span className="min-w-[150px] text-[13.5px] font-medium">{lane.label}</span>

              <span className={`readout min-w-[70px] text-[12.5px] ${TONE[status] ?? ""}`}>
                {status}
              </span>

              {/* The status is the only editable thing here: everything else
                  on the row is either known or was recorded with the touch. */}
              <form action={setTouch} className="shrink-0">
                <input type="hidden" name="accountId" value={accountId} />
                <input type="hidden" name="lane" value={lane.key} />
                <select
                  name="status"
                  defaultValue={status}
                  aria-label={`${lane.label} status`}
                  className="min-h-[26px] rounded-[var(--alac-radius-sm)] border border-transparent bg-transparent px-1.5 text-[12px] text-[var(--alac-text-2)] hover:border-[var(--alac-line)] focus:border-[var(--alac-accent)] focus:outline-none"
                >
                  {options.map((o) => (
                    <option key={o} value={o} className="bg-[var(--alac-surface)]">{o}</option>
                  ))}
                </select>
                <button type="submit" className="ml-1 text-[11.5px] text-[var(--alac-accent)]">
                  set
                </button>
              </form>

              <span className="min-w-0 flex-1 text-[12.5px] text-[var(--alac-text-3)]">
                {known.length > 0
                  ? `${known.length} known: ${known.slice(0, 2).map((p) => p.full_name).join(", ")}${known.length > 2 ? ` +${known.length - 2}` : ""}`
                  : lane.hint}
              </span>

              {t?.touched_at ? (
                <span className="readout shrink-0 text-[11.5px] text-[var(--alac-text-3)]">
                  {t.person ? `${t.person}, ` : ""}{t.touched_at}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
