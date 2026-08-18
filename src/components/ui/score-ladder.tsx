import type { BreakdownTerm } from "@/lib/server/queries/portfolio";
import { Meter } from "./primitives";

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
    <div className="well mx-5 mb-5 overflow-x-auto px-5 py-4">
      <div className="min-w-[420px]">
      <div className="placard mb-3 flex items-baseline justify-between text-[12px] text-[var(--md-on-surface-variant)]">
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
              <span className="readout w-[26px] shrink-0 text-right text-[12px] text-[var(--md-on-surface-muted)]">
                {i + 1}
              </span>

              <span className="w-[124px] shrink-0 truncate text-[12.5px] text-[var(--md-on-surface-variant)]">
                {s.term.term}
              </span>

              {/* The rung: a rounded track with the span this term added,
                  offset by everything before it. That offset is what makes it
                  a ladder and not 14 unrelated bars. A penalty is drawn in
                  error tone, so it reads as a retreat without needing the
                  hard directional edge the previous theme used. */}
              <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--md-surface-container-high)]">
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${startPct}%`,
                    width: `${Math.max(widthPct, s.signed === 0 ? 0 : 0.8)}%`,
                    background: isPenalty ? "var(--md-error)" : "var(--md-primary)",
                  }}
                />
              </span>

              {/* The contribution. Where a ceiling clipped the term, both
                  numbers are shown: what it earned, and what it was allowed
                  to add. Hiding either one would make the table and the
                  ladder disagree. */}
              <span
                className="readout w-[60px] shrink-0 text-right text-[12.5px]"
                style={{
                  color: isPenalty ? "var(--md-error)" : "var(--md-on-surface-variant)",
                }}
                title={
                  s.clipped > 0
                    ? `Term earned ${s.term.points}, capped to ${s.signed} by the component ceiling`
                    : undefined
                }
              >
                {s.clipped > 0 ? (
                  <>
                    <span className="text-[var(--md-on-surface-muted)] line-through">
                      +{s.term.points}
                    </span>{" "}
                    <span className="text-[var(--md-warning)]">+{s.signed}</span>
                  </>
                ) : (
                  <>
                    {isPenalty ? "−" : "+"}
                    {s.term.points}
                  </>
                )}
              </span>

              <span className="readout w-[34px] shrink-0 text-right text-[12.5px] text-[var(--md-primary)]">
                {s.to}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The close. The ladder's final rung and the stored score are printed
          together: if they ever disagree, the operator sees it here first. */}
      <div className="mt-3 flex items-center gap-3 border-t border-[var(--md-outline-variant)] pt-3.5">
        <span className="w-[26px] shrink-0" />
        <span className="placard w-[124px] shrink-0 text-[12px] text-[var(--md-on-surface-variant)]">
          Composite
        </span>
        <span className="min-w-0 flex-1">
          <Meter value={total} max={100} height={10} />
        </span>
        <span className="w-[60px] shrink-0" />
        <span className="readout w-[34px] shrink-0 text-right text-[16px] text-[var(--md-primary)]">
          {total}
        </span>
      </div>

      {clippedTotal > 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--md-on-surface-muted)]">
          {clippedTotal} point{clippedTotal === 1 ? "" : "s"} were earned but not counted: a component
          stops contributing once it reaches its ceiling. The term table below shows every point each
          term earned, before that cap.
        </p>
      ) : null}

      {running !== total ? (
        <p className="mt-3 rounded-[var(--md-radius-md)] bg-[var(--md-warning-container)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--md-on-surface)]">
          The terms accumulate to {running}, and the stored composite score is {total}. Both are shown
          exactly as recorded. A gap means the score was written by a different engine version than the
          breakdown, so treat the terms as the audit trail and re-run scoring to reconcile.
        </p>
      ) : null}
      </div>
    </div>
  );
}
