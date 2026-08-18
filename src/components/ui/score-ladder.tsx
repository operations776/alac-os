import type { BreakdownTerm } from "@/lib/server/queries/portfolio";
import { TickScale } from "./primitives";

/**
 * The score ladder.
 *
 * This is the trust instrument. The 14 breakdown terms are the arithmetic
 * behind the headline number, and the product's whole claim is that the number
 * is auditable. A table alone states the terms; the ladder shows them
 * accumulating, so the operator can see the score being built rather than
 * being asked to trust a total.
 *
 * Every term renders three ways at once: as a row of the table, as a segment
 * of the accumulation bar, and as a running subtotal in the margin. Nothing is
 * hidden behind hover, and nothing is summarised away. Contract rule 10.
 *
 * The layout is presentational. The numbers are exactly the stored terms and
 * the totals are their sum, computed here only for display.
 */

const COMPONENT_LABELS: Record<string, string> = {
  icp_fit: "ICP fit",
  hiring: "Hiring signal",
  timing: "Timing",
  relationship: "Relationship",
  revenue: "Revenue potential",
  penalty: "Penalty",
};

export function componentLabel(key: string) {
  return COMPONENT_LABELS[key] ?? key;
}

/**
 * Each component contributes at most its ceiling, so a component whose terms
 * over-earn is clamped before it reaches the composite. The ladder has to
 * apply the same clamp or its running total drifts above the stored score and
 * the screen accuses a correct engine of being wrong.
 */
const COMPONENT_MAX: Record<string, number> = {
  icp_fit: 25,
  hiring: 25,
  timing: 20,
  relationship: 15,
  revenue: 15,
};

export function ScoreLadder({
  terms,
  total,
}: {
  terms: BreakdownTerm[];
  total: number;
}) {
  if (terms.length === 0) return null;

  // Running accumulation, in the stored order. Penalty terms subtract, and a
  // component stops contributing once it reaches its ceiling.
  //
  // Built with a fold rather than a mutated closure variable: the React
  // Compiler treats reassigning a captured local during render as unsafe,
  // and the fold says the same thing without the mutation.
  const steps = terms.reduce<
    {
      term: BreakdownTerm;
      signed: number;
      from: number;
      to: number;
      clipped: number;
    }[]
  >((acc, t) => {
    const from = acc.length === 0 ? 0 : acc[acc.length - 1].to;

    if (t.component === "penalty") {
      acc.push({ term: t, signed: -t.points, from, to: from - t.points, clipped: 0 });
      return acc;
    }

    // How much of this component has already been counted, and how much room
    // its ceiling leaves.
    const max = COMPONENT_MAX[t.component];
    const earned = acc
      .filter((s) => s.term.component === t.component)
      .reduce((n, s) => n + s.signed, 0);
    const room = max == null ? t.points : Math.max(0, max - earned);
    const signed = Math.min(t.points, room);

    acc.push({ term: t, signed, from, to: from + signed, clipped: t.points - signed });
    return acc;
  }, []);

  const running = steps.length === 0 ? 0 : steps[steps.length - 1].to;
  const clippedTotal = steps.reduce((n, s) => n + s.clipped, 0);

  // The ladder is scaled to the largest point the running total reaches, so a
  // penalty that pushes the line back is visible as a retreat rather than
  // being clipped.
  const ceiling = Math.max(100, ...steps.map((s) => Math.max(s.from, s.to)));

  return (
    <div className="well overflow-x-auto border-t border-[var(--line)] px-5 py-4">
      <div className="min-w-[420px]">
      <div className="placard mb-3 flex items-baseline justify-between text-[10px] text-[var(--ink-3)]">
        <span>Accumulation</span>
        <span>Running total</span>
      </div>

      <ol className="flex flex-col gap-[3px]">
        {steps.map((s, i) => {
          const isPenalty = s.term.component === "penalty";
          // Each rung draws the span this term added, offset by everything
          // before it. That offset is what makes it a ladder and not 14
          // unrelated bars.
          const startPct = (Math.min(s.from, s.to) / ceiling) * 100;
          const widthPct = (Math.abs(s.signed) / ceiling) * 100;

          return (
            <li key={`${s.term.component}-${s.term.term}-${i}`} className="flex items-center gap-3">
              <span className="readout w-[26px] shrink-0 text-right text-[10.5px] text-[var(--ink-3)]">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="w-[124px] shrink-0 truncate text-[11.5px] text-[var(--ink-2)]">
                {s.term.term}
              </span>

              {/* The rung. */}
              <span className="relative h-[13px] min-w-0 flex-1">
                <span className="absolute inset-0 bg-[var(--bg)] shadow-[inset_0_0_0_1px_var(--line)]" />
                {/* Graduations every 10 points, so a rung can be read against
                    the same scale as the composite readout. */}
                <span
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, color-mix(in oklab, var(--ink) 14%, transparent) 0 1px, transparent 1px 10%)",
                  }}
                />
                {/* The span this term covers, with a hard leading edge. The
                    edge is on the side the term travelled to, so a penalty is
                    marked on the left and reads as a retreat. */}
                <span
                  className="absolute inset-y-0"
                  style={{
                    left: `${startPct}%`,
                    width: `${Math.max(widthPct, s.signed === 0 ? 0 : 0.6)}%`,
                    background: isPenalty
                      ? "color-mix(in oklab, var(--bad) 30%, transparent)"
                      : "color-mix(in oklab, var(--readout) 30%, transparent)",
                    borderLeft: isPenalty ? "2px solid var(--bad)" : "none",
                    borderRight: isPenalty ? "none" : "2px solid var(--readout)",
                  }}
                />
              </span>

              {/* The contribution. Where a ceiling clipped the term, both
                  numbers are shown: what it earned, and what it was allowed
                  to add. Hiding either one would make the table and the
                  ladder disagree. */}
              <span
                className="readout w-[60px] shrink-0 text-right text-[11.5px] font-medium"
                style={{ color: isPenalty ? "var(--bad)" : "var(--ink-2)" }}
                title={
                  s.clipped > 0
                    ? `Term earned ${s.term.points}, capped to ${s.signed} by the component ceiling`
                    : undefined
                }
              >
                {s.clipped > 0 ? (
                  <>
                    <span className="text-[var(--ink-3)] line-through">+{s.term.points}</span>{" "}
                    <span className="text-[var(--warn)]">+{s.signed}</span>
                  </>
                ) : (
                  <>
                    {isPenalty ? "−" : "+"}
                    {s.term.points}
                  </>
                )}
              </span>

              <span className="readout w-[34px] shrink-0 text-right text-[11.5px] text-[var(--readout)]">
                {s.to}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The close. The ladder's final rung and the stored score are printed
          together: if they ever disagree, the operator sees it here first. */}
      <div className="mt-3 flex items-center gap-3 border-t border-[var(--line)] pt-3">
        <span className="w-[26px] shrink-0" />
        <span className="placard w-[124px] shrink-0 text-[10px] text-[var(--ink-3)]">
          Composite
        </span>
        <span className="min-w-0 flex-1">
          <TickScale value={total} max={100} ticks={10} height={13} />
        </span>
        <span className="w-[60px] shrink-0" />
        <span className="readout w-[34px] shrink-0 text-right text-[15px] text-[var(--readout)]">
          {total}
        </span>
      </div>

      {clippedTotal > 0 ? (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          {clippedTotal} point{clippedTotal === 1 ? "" : "s"} were earned but not counted: a component
          stops contributing once it reaches its ceiling. The term table below shows every point each
          term earned, before that cap.
        </p>
      ) : null}

      {running !== total ? (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--warn)]">
          The terms accumulate to {running}, and the stored composite score is {total}. Both are shown
          exactly as recorded. A gap means the score was written by a different engine version than the
          breakdown, so treat the terms as the audit trail and re-run scoring to reconcile.
        </p>
      ) : null}
      </div>
    </div>
  );
}
