"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog } from "./dialog";

/**
 * The arithmetic behind one number.
 *
 * Section 4 of the brief: every score, rank and recommendation carries a why,
 * its supporting facts, its confidence and its freshness. Section 7 adds the
 * harder half, that no number may be a dead end. This is the one component
 * that satisfies both, so every score in the app opens the same way and the
 * operator learns the gesture once.
 *
 * Terms are shown exactly as the scorer produced them, positive and negative,
 * and they add to the total in view. If they ever disagree the panel says so
 * rather than picking one, because a breakdown that quietly reconciles itself
 * is decoration rather than an audit trail.
 */
export type Term = {
  term: string;
  points: number;
  input?: string | number | null;
  core?: boolean;
  /** A term that explains an input to the score rather than scoring itself.
   *  Shown above the arithmetic and deliberately excluded from the total, so
   *  the sum on screen always equals the score on screen. */
  reason?: boolean;
  of?: string;
};

export function Why({
  score,
  max = 100,
  title,
  subject,
  summary,
  terms,
  facts,
  confidence,
  freshness,
  source,
  label = "Why",
}: {
  score: number | null;
  max?: number;
  title: string;
  subject?: string;
  /** One sentence, for people who will not open the breakdown. */
  summary?: string;
  terms?: Term[];
  /** Supporting facts that are not points: what it was read from. */
  facts?: { label: string; value: string }[];
  confidence?: string | null;
  freshness?: string | null;
  source?: { label: string; href: string } | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Reason terms explain how an input was reached; only scoring terms add up.
  const reasons = (terms ?? []).filter((t) => t.reason);
  const scoring = (terms ?? []).filter((t) => !t.reason);
  const sum = scoring.reduce((n, t) => n + t.points, 0);
  const disagrees = score != null && scoring.length > 0 ? sum !== score : false;
  const groups = [...new Set(reasons.map((r) => r.of ?? "reasons"))];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={summary ? `${summary}. Click for the full arithmetic` : "Why this number"}
        className="inline-flex items-center gap-1 text-[var(--alac-text-3)] transition-colors hover:text-[var(--alac-accent)]"
        aria-label={`Why: ${title}`}
      >
        <Info size={16} strokeWidth={1.5} />
        <span className="text-[11.5px]">{label}</span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={title} sub={subject}>
        <div className="flex flex-col gap-4">
          {score != null ? (
            <div className="flex items-baseline gap-3">
              <span className="readout text-[38px] leading-none text-[var(--alac-accent)]">
                {score}
                <span className="text-[15px] text-[var(--alac-text-3)]"> / {max}</span>
              </span>
              {summary ? (
                <span className="text-[13.5px] leading-snug text-[var(--alac-text-2)]">{summary}</span>
              ) : null}
            </div>
          ) : summary ? (
            <p className="text-[13.5px] leading-[1.6] text-[var(--alac-text-2)]">{summary}</p>
          ) : null}

          {/* How each input was reached. These are the reasons behind the
              numbers that feed the arithmetic, so they carry points for
              readability but never join the total. */}
          {groups.map((g) => (
            <div key={g}>
              <div className="placard mb-2 text-[11px] text-[var(--alac-text-2)]">
                {g === "difficulty" ? "How hard it is to fill" : g === "age" ? "How long it has been open" : "Reasons"}
              </div>
              <ul className="flex flex-col">
                {reasons
                  .filter((r) => (r.of ?? "reasons") === g)
                  .map((t, i) => (
                    <li
                      key={`${t.term}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-3 border-b border-[var(--alac-line)] py-1.5 last:border-0"
                    >
                      <span
                        className={`readout w-10 shrink-0 text-right text-[12.5px] ${
                          t.points < 0 ? "text-[var(--alac-red-text)]" : "text-[var(--alac-text-2)]"
                        }`}
                      >
                        {t.points > 0 ? "+" : ""}{t.points}
                      </span>
                      <span className="min-w-[140px] flex-1 text-[12.5px]">{t.term}</span>
                      {t.input != null ? (
                        <span className="text-[12px] text-[var(--alac-text-3)]">{String(t.input)}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ))}

          {scoring.length > 0 ? (
            <div>
              <div className="placard mb-2 text-[11px] text-[var(--alac-text-2)]">
                How the score adds up
              </div>
              <ul className="flex flex-col">
                {scoring.map((t, i) => (
                  <li
                    key={`${t.term}-${i}`}
                    className={`flex flex-wrap items-baseline gap-x-3 border-b border-[var(--alac-line)] py-2 last:border-0 ${
                      t.core ? "bg-[var(--alac-accent-soft)] px-2" : ""
                    }`}
                  >
                    <span
                      className={`readout w-10 shrink-0 text-right text-[13px] ${
                        t.points < 0 ? "text-[var(--alac-red-text)]" : "text-[var(--alac-accent)]"
                      }`}
                    >
                      {t.points > 0 ? "+" : ""}{t.points}
                    </span>
                    <span className="min-w-[140px] flex-1 text-[13px]">{t.term}</span>
                    {t.input != null ? (
                      <span className="text-[12px] text-[var(--alac-text-3)]">{String(t.input)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--alac-line)] pt-2">
                <span className="text-[12.5px] text-[var(--alac-text-2)]">Total</span>
                <span className="readout text-[14px]">{sum}</span>
              </div>
              {disagrees ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--alac-warn)]">
                  The terms add to {sum} and the stored score is {score}. Both are shown exactly as
                  recorded: a gap means this row was scored by a different version of the model than
                  the terms describe.
                </p>
              ) : null}
            </div>
          ) : null}

          {facts && facts.length > 0 ? (
            <div>
              <div className="placard mb-2 text-[11px] text-[var(--alac-text-2)]">
                What it was read from
              </div>
              <dl className="flex flex-col gap-1.5">
                {facts.map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <dt className="shrink-0 text-[var(--alac-text-3)]">{f.label}</dt>
                    <dd className="min-w-0 text-right text-[var(--alac-text-2)]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {(confidence || freshness || source) ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--alac-line)] pt-3 text-[12.5px] text-[var(--alac-text-3)]">
              {confidence ? <span>Confidence: {confidence}</span> : null}
              {freshness ? <span>{freshness}</span> : null}
              {source ? (
                <a href={source.href} target="_blank" rel="noreferrer" className="link">
                  {source.label}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
