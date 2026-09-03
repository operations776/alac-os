import { Why, type Term } from "./why";
import { scoreRole } from "@/lib/scoring/roles.mjs";
import { explainBand, explainRoleFull, explainSignal, explainMove } from "@/lib/scoring/explain.mjs";

/**
 * The typed boundary over the explanation builders, which are plain .mjs so
 * the scripts can use them too. Same split as pricing over rates.
 *
 * Each of these is a thin wrapper: it asks the scorer why, and hands the
 * answer to the one Why panel. Nothing decides anything here.
 */

type Built = {
  score?: number | null;
  summary?: string;
  terms?: Term[];
  facts?: { label: string; value: string }[];
  confidence?: string | null;
  freshness?: string | null;
  source?: { label: string; href: string } | null;
};

type RoleLike = {
  title: string;
  occupation?: string | null;
  first_seen?: string | null;
  salary_text?: string | null;
  location?: string | null;
  relevance?: number | null;
  open_at_company?: number | null;
};

/** Why this role is worth calling about: difficulty, age, and the arithmetic. */
export function WhyRole({ role, label }: { role: RoleLike; label?: string }) {
  const scored = scoreRole(role) as { value: number; terms: Term[] };
  const built = explainRoleFull(role) as Built;
  return (
    <Why
      label={label}
      title="Why this role scores what it does"
      subject={role.title}
      score={role.relevance ?? scored.value}
      terms={scored.terms}
      summary={built.summary}
      facts={built.facts}
      freshness={built.freshness}
    />
  );
}

type BandLike = Parameters<typeof explainBand>[0];

/** Why this company is in this band, at this rank. */
export function WhyBand({ account, label }: { account: BandLike; label?: string }) {
  const built = explainBand(account) as Built;
  return (
    <Why
      label={label}
      title="Why this company is on the list"
      subject={(account as { company_name?: string }).company_name}
      score={built.score ?? null}
      summary={built.summary}
      facts={built.facts}
      freshness={built.freshness}
    />
  );
}

type SignalLike = Parameters<typeof explainSignal>[0];

/** What changed, how sure we are, and where it came from. */
export function WhySignal({
  signal,
  score,
  terms,
  label,
}: {
  signal: SignalLike;
  score?: number | null;
  terms?: Term[];
  label?: string;
}) {
  const built = explainSignal(signal) as Built;
  return (
    <Why
      label={label}
      title="Why this signal matters"
      subject={(signal as { company_name?: string }).company_name}
      score={score ?? null}
      terms={terms}
      summary={built.summary}
      facts={built.facts}
      confidence={built.confidence}
      freshness={built.freshness}
      source={built.source}
    />
  );
}

type MoveLike = Parameters<typeof explainMove>[0];

/** Why the desk is telling him to do this, and what it read to decide. */
export function WhyMove({ account, label }: { account: MoveLike; label?: string }) {
  const built = explainMove(account) as Built & { move: string };
  return (
    <Why
      label={label}
      title="Why this is the next move"
      subject={built.move}
      score={null}
      summary={built.summary}
      facts={built.facts}
    />
  );
}

/** Why a candidate matched a role: the reasons and anything blocking it. */
export function WhyMatch({
  score,
  role,
  candidate,
  why,
  flags,
  label,
}: {
  score: number;
  role: string;
  candidate: string;
  why: string[];
  flags: string[];
  label?: string;
}) {
  return (
    <Why
      label={label}
      title="Why this role matched"
      subject={`${candidate} against ${role}`}
      score={score}
      summary={why.join(". ") || "Matched on function and level."}
      facts={[
        ...why.map((w, i) => ({ label: i === 0 ? "Matched on" : " ", value: w })),
        ...flags.map((f) => ({ label: "Watch out", value: f })),
      ]}
    />
  );
}
