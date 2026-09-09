import { Info } from "lucide-react";

/**
 * A column or control label with its meaning one hover away.
 *
 * His clarification: if a field is not immediately obvious, a simple tooltip
 * saying what it means and what action it drives. Native title, so it works
 * everywhere without a script, and an icon so the reader knows there is one.
 */
export function Hint({ label, text }: { label: string; text: string }) {
  return (
    <span className="placard inline-flex items-center gap-1.5 text-[11px] text-[var(--alac-text-2)]" title={text}>
      {label}
      <Info size={16} strokeWidth={1.5} className="text-[var(--alac-text-3)]" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
