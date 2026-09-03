import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { getOrgId } from "@/lib/server/queries/desk";
import { candidateById, radar, type RadarRole } from "@/lib/server/queries/talent";
import { Card, CardHeader, EmptyState, NoticeLine, PageHeader, Stat } from "@/components/ui/primitives";
import { togglePitch } from "../actions";
import { WhyMatch, WhyRole } from "@/components/ui/explain";

export const dynamic = "force-dynamic";

// MPC DEMAND RADAR. Section 21.
//
// The rule that shapes this page is 21.1: never stop at zero. If no exact
// requisition matches, the screen still has to answer with adjacent roles,
// companies whose signals imply a need, and strategic accounts. MPC marketing
// creates demand rather than waiting for the perfect posting.

const EXAMPLES = [
  "Director Navy BD in UAS, DMV",
  "broaden to capture management",
  "roles 70%+ match open 45+ days",
];

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const candidate = await candidateById(orgId, id);
  if (!candidate) notFound();

  const results = await radar(orgId, candidate, { q });
  const { exact, adjacent, implied, strategic, parsed } = results;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <Link href="/talent" className="btn btn-ghost mb-4 -ml-4">
        <ArrowLeft size={16} strokeWidth={1.5} /> All candidates
      </Link>

      <PageHeader
        eyebrow="Demand radar"
        title={candidate.full_name}
        lede={`${candidate.title ?? "Title unknown"}${candidate.company ? `, ${candidate.company}` : ""}. Searching every requisition already collected, plus companies whose signals imply a need.`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="chip bg-[var(--alac-purple-soft)] text-[var(--alac-purple)]">
          MPC {candidate.mpc_score ?? "--"}
        </span>
        {candidate.clearance ? <span className="chip">{candidate.clearance}</span> : null}
        {candidate.geography ? <span className="chip">{candidate.geography}</span> : null}
        {candidate.domains
          ? candidate.domains.split(",").slice(0, 5).map((d) => (
              <span key={d} className="chip text-[var(--alac-text-3)]">{d.trim()}</span>
            ))
          : null}
        {candidate.linkedin_url ? (
          <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5 text-[12.5px]">
            Profile <ExternalLink size={16} strokeWidth={1.5} />
          </a>
        ) : null}
      </div>

      {/* The search. Natural language plus whatever structure it can read. */}
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Director Navy BD in UAS, DMV"
          aria-label="Search the requisitions"
          className="field w-full sm:w-[420px]"
        />
        <button type="submit" className="btn btn-primary">Search demand</button>
        {q ? <Link href={`/talent/${candidate.id}`} className="btn btn-ghost">Clear</Link> : null}
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--alac-text-3)]">
        <span>Try:</span>
        {EXAMPLES.map((e) => (
          <Link key={e} href={`/talent/${candidate.id}?q=${encodeURIComponent(e)}`} className="chip">
            {e}
          </Link>
        ))}
      </div>

      {q && (parsed.level || parsed.geography || parsed.minScore || parsed.minAge) ? (
        <div className="mb-5">
          <NoticeLine>
            Read as
            {parsed.level ? ` level ${parsed.level}` : ""}
            {parsed.geography ? `, ${parsed.geography}` : ""}
            {parsed.minScore ? `, at least ${parsed.minScore}% match` : ""}
            {parsed.minAge ? `, open ${parsed.minAge}+ days` : ""}. Everything else in the search
            was matched as language against titles and domains.
          </NoticeLine>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Exact matches" value={exact.length} tone={exact.length > 0 ? "good" : undefined} />
        <Stat label="Adjacent" value={adjacent.length} hint="worth a conversation" />
        <Stat label="Implied demand" value={implied.length} hint="signals, no posting" />
        <Stat label="Strategic targets" value={strategic.length} hint="no posting needed" />
      </div>

      <div className="flex flex-col gap-6">
        <Bucket
          title="Exact live matches"
          sub="Strong fit to a requisition that is open now"
          roles={exact}
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          empty="No requisition currently open is a direct fit. The buckets below are the reason this screen does not stop here."
        />
        <Bucket
          title="Adjacent live matches"
          sub="Related roles that may still be commercially useful"
          roles={adjacent}
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          empty="Nothing adjacent in the current corpus."
        />

        {/* The two buckets that do not need a requisition at all. */}
        <Card>
          <CardHeader
            title="Implied demand"
            sub="No posting required. Something changed at these companies that implies a need"
          />
          {implied.length === 0 ? (
            <EmptyState title="Nothing implied" body="No company in the working list has a recent signal that is unmatched." />
          ) : (
            <ul className="flex flex-col gap-0.5 px-3 pb-3">
              {implied.map((a) => (
                <li key={a.id} className="row-hover rounded-[var(--alac-radius)] px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">{a.company_name}</Link>
                    {a.heat_score != null ? (
                      <span className="chip bg-[var(--alac-cyan-soft)] text-[var(--alac-cyan)]">Urgency {a.heat_score}</span>
                    ) : null}
                    {a.top_contact ? (
                      <span className="ml-auto text-[12.5px] text-[var(--alac-text-3)]">
                        {a.top_contact}{a.top_contact_title ? `, ${a.top_contact_title}` : ""}
                      </span>
                    ) : null}
                  </div>
                  {a.signal_text ? (
                    <p className="mt-1 text-[12.5px] leading-snug text-[var(--alac-text-2)]">{a.signal_text}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Strategic targets"
            sub="Top accounts where this candidate could create a search"
          />
          {strategic.length === 0 ? (
            <EmptyState title="Nothing to add" body="Every working account already appears above." />
          ) : (
            <ul className="flex flex-col gap-0.5 px-3 pb-3">
              {strategic.map((a) => (
                <li key={a.id} className="row-hover flex flex-wrap items-baseline gap-x-3 rounded-[var(--alac-radius)] px-3 py-2.5">
                  <Link href={`/queue/${a.id}`} className="link text-[14px] font-medium">{a.company_name}</Link>
                  <span className="chip">Work now</span>
                  {a.top_contact ? (
                    <span className="ml-auto text-[12.5px] text-[var(--alac-text-3)]">
                      {a.top_contact}{a.top_contact_title ? `, ${a.top_contact_title}` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Bucket({
  title,
  sub,
  roles,
  candidateId,
  candidateName,
  empty,
}: {
  title: string;
  sub: string;
  roles: RadarRole[];
  candidateId: string;
  candidateName: string;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader title={`${title}${roles.length ? ` (${roles.length})` : ""}`} sub={sub} />
      {roles.length === 0 ? (
        <EmptyState title="None" body={empty} />
      ) : (
        <ul className="flex flex-col gap-0.5 px-3 pb-3">
          {roles.map((r) => (
            <li key={r.id} className="row-hover rounded-[var(--alac-radius)] px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {/* Pitched: this role has already been raised for this
                    candidate. One row, toggled, like every other mark. */}
                <form action={togglePitch} className="shrink-0">
                  <input type="hidden" name="candidateId" value={candidateId} />
                  <input type="hidden" name="roleId" value={r.id} />
                  <input type="hidden" name="on" value={r.pitched ? "0" : "1"} />
                  <button
                    type="submit"
                    role="checkbox"
                    aria-checked={r.pitched}
                    aria-label={r.pitched ? "Pitched, click to clear" : "Mark as pitched"}
                    title={r.pitched ? "Already raised with the client" : "Mark that you have raised this role"}
                    className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border ${
                      r.pitched
                        ? "border-[var(--alac-good)] bg-[var(--alac-good)] text-[var(--alac-ground)]"
                        : "border-[var(--alac-line)] bg-[var(--alac-ground)] hover:border-[var(--alac-accent)]"
                    }`}
                  >
                    {r.pitched ? <Check size={16} strokeWidth={1.5} /> : null}
                  </button>
                </form>

                <span className="readout w-8 shrink-0 text-right text-[13px] text-[var(--alac-accent)]">
                  {r.match.score}%
                </span>
                <Link href={`/queue/${r.account_id}`} className="link shrink-0 text-[13.5px] font-medium">
                  {r.company_name}
                </Link>
                <span className="min-w-[180px] flex-1 text-[13.5px]">{r.title}</span>
                {r.location ? (
                  <span className="shrink-0 text-[12px] text-[var(--alac-text-3)]">{r.location}</span>
                ) : null}
                {r.salary_text ? (
                  <span className="shrink-0 text-[12px] text-[var(--alac-text-2)]">{r.salary_text}</span>
                ) : null}
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="link inline-flex shrink-0 items-center gap-1.5 text-[12px]">
                    Posting <ExternalLink size={16} strokeWidth={1.5} />
                  </a>
                ) : null}
                <span className="flex shrink-0 items-center gap-3">
                  <WhyMatch
                    score={r.match.score}
                    role={r.title}
                    candidate={candidateName}
                    why={r.match.why}
                    flags={r.match.flags}
                    label="Why matched"
                  />
                  <WhyRole role={r} label="Why the role" />
                </span>
              </div>

              {/* Why it matched, and anything that would stop it. Section 21
                  asks for both on every result. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[46px] text-[12px]">
                {r.match.why.map((w) => (
                  <span key={w} className="text-[var(--alac-text-3)]">{w}</span>
                ))}
                {r.match.flags.map((f) => (
                  <span key={f} className="text-[var(--alac-warn)]">{f}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
