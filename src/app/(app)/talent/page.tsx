import Link from "next/link";
import { getOrgId } from "@/lib/server/queries/desk";
import { candidates } from "@/lib/server/queries/talent";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { Row } from "@/components/ui/clickable";
import { AnalyzeCandidateForm } from "./form";

export const dynamic = "force-dynamic";

// TALENT. The supply side, section 19.
//
// Deliberately a short list. The brief is explicit: 3 to 5 strong MPCs per
// priority market, "not a large database labeled MPC". A screen that made it
// easy to accumulate hundreds would be working against that.

export default async function TalentPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
        <Card><EmptyState title="No organization" body="Seed an org first." /></Card>
      </div>
    );
  }

  const list = await candidates(orgId);
  const platinum = list.filter((c) => (c.mpc_score ?? 0) >= 95).length;
  const gold = list.filter((c) => (c.mpc_score ?? 0) >= 90 && (c.mpc_score ?? 0) < 95).length;
  const cleared = list.filter((c) => c.clearance).length;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-7">
      <PageHeader
        eyebrow="Talent"
        title="Who we can take to market"
        lede="Controlled, marketable candidates. Each one can search every requisition already collected, and find demand even where no matching job is posted."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active candidates" value={list.length} hint="aim for 3 to 5 per market" />
        <Stat label="Gold or better" value={platinum + gold} tone={platinum + gold > 0 ? "good" : undefined} />
        <Stat label="Cleared" value={cleared} hint="clearance recorded" />
        <Stat label="Requisitions to search" value="4,000+" hint="already collected" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          {list.length === 0 ? (
            <Card>
              <EmptyState
                title="No candidates yet"
                body="Paste a profile on the right. The system classifies them, then searches every requisition already collected for exact matches, adjacent roles, implied demand and strategic targets."
              />
            </Card>
          ) : (
            <ol className="rise-list flex flex-col gap-3">
              {list.map((c) => (
                <Row as="li" key={c.id} href={`/talent/${c.id}`}>
                  <Card interactive className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link href={`/talent/${c.id}`} className="link display text-[16px] font-medium">
                        {c.full_name}
                      </Link>
                      <span className="chip bg-[var(--alac-purple-soft)] text-[var(--alac-purple)]">
                        MPC {c.mpc_score ?? "--"}
                      </span>
                      {c.clearance ? <span className="chip">{c.clearance}</span> : null}
                      <span className="readout ml-auto text-[12.5px] text-[var(--alac-text-3)]">
                        Search demand
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] text-[var(--alac-text-2)]">
                      {c.title ?? "Title unknown"}
                      {c.company ? `, ${c.company}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--alac-text-3)]">
                      {c.geography ? <span>{c.geography}</span> : null}
                      {c.domains ? <span>{c.domains}</span> : null}
                    </div>
                  </Card>
                </Row>
              ))}
            </ol>
          )}
        </div>

        <Card className="px-5 py-5">
          <div className="placard mb-3 text-[12px] text-[var(--alac-text-2)]">Analyze a candidate</div>
          <AnalyzeCandidateForm />
        </Card>
      </div>
    </div>
  );
}
