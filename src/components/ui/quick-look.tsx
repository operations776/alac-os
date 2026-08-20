"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Dialog } from "./dialog";

/**
 * A peek at a company without leaving the board.
 *
 * The board's job is to let someone triage 25 companies quickly. Opening a
 * full page to check one fact and then going back loses the reading position
 * every time, so the facts that decide "is this worth opening" are shown in
 * place and the full page stays one click away.
 *
 * Everything shown here is already loaded with the row. The dialog fetches
 * nothing, which is what keeps it instant.
 */
export function QuickLook({
  company,
  reason,
  fit,
  urgency,
  roles,
  warm,
  decisionMakers,
  topContact,
  topContactTitle,
  href,
}: {
  company: string;
  reason: string | null;
  fit: number | null;
  urgency: number | null;
  roles: number;
  warm: number;
  decisionMakers: number;
  topContact: string | null;
  topContactTitle: string | null;
  href: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Quick look at ${company}`}
        title="Quick look"
        className="shrink-0 rounded-[var(--alac-radius-sm)] p-1.5 text-[var(--alac-text-3)] transition-colors hover:bg-[var(--alac-surface-2)] hover:text-[var(--alac-accent)]"
      >
        <Eye size={16} strokeWidth={1.5} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={company}
        sub={reason ?? undefined}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
              Close
            </button>
            <Link href={href} className="btn btn-primary">
              Open the full page
            </Link>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Fit" value={fit != null ? String(Math.round(fit)) : "not scored"} />
          <Metric
            label="Urgency"
            value={urgency != null ? String(urgency) : "nothing recent"}
            dim={urgency == null}
          />
          <Metric
            label="Open roles"
            value={roles > 0 ? `${roles} relevant` : "none found"}
            dim={roles === 0}
          />
          <Metric
            label="You know"
            value={
              decisionMakers > 0
                ? `${decisionMakers} decision ${decisionMakers === 1 ? "maker" : "makers"}`
                : warm > 0
                  ? `${warm} ${warm === 1 ? "person" : "people"}`
                  : "nobody yet"
            }
            dim={warm === 0}
          />
        </div>

        <div className="well mt-4 px-4 py-3.5">
          <div className="placard mb-1.5 text-[10px] text-[var(--alac-text-2)]">Contact first</div>
          {topContact ? (
            <p className="text-[14px] leading-snug">
              {topContact}
              {topContactTitle ? (
                <span className="block text-[12.5px] text-[var(--alac-text-3)]">
                  {topContactTitle}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-[var(--alac-text-3)]">
              Nobody sourced yet. The full page has the button to pull the senior engineering and
              talent leaders for this company.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}

function Metric({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="well px-4 py-3">
      <div className="placard text-[10px] text-[var(--alac-text-2)]">{label}</div>
      <div
        className={`readout mt-1.5 text-[16px] ${
          dim ? "text-[var(--alac-text-3)]" : "text-[var(--alac-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
