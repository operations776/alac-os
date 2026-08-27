import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { AddCompanyForm } from "./form";

export const dynamic = "force-dynamic";

// Add a company that is not in the TAM. Pre-filled from wherever the reader
// came from (a signal at an unlisted company passes its name).

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; domain?: string }>;
}) {
  const p = await searchParams;
  return (
    <div className="mx-auto max-w-[720px] px-5 py-6 sm:px-8 sm:py-7">
      <Link href="/queue" className="btn btn-ghost mb-4 -ml-4">
        <ArrowLeft size={16} strokeWidth={1.5} /> All companies
      </Link>
      <PageHeader
        eyebrow="Add a company"
        title="Not on the list yet"
        lede="Goes straight into Up next. The next refresh pulls its signals and open roles and ranks it with everyone else. Fit score and priority stay with the master list."
      />
      <Card className="px-5 py-5">
        <AddCompanyForm name={p.name ?? ""} domain={p.domain ?? ""} />
      </Card>
    </div>
  );
}
