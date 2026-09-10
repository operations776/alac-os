import { sql } from "@/lib/server/db";
import { verifyRoles } from "@/lib/server/roles/verify";

// The daily check that the roles on screen are still open.
//
// A pull costs a provider credit, so it runs twice a week. Checking whether
// a page is still there costs nothing but a request to the employer's own
// board, so it runs every morning: a posting filled on Tuesday should not
// still be a live lead on Wednesday.
//
// Vercel Cron calls this with the project's CRON_SECRET as a bearer token.
// Without the secret set the route refuses rather than running open to the
// internet: a URL anyone can hit that makes hundreds of outbound requests is
// somebody else's denial of service tool.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every org with roles on a screen. There is one today, and hardcoding
  // that would be a bug the day there are two.
  const orgs = (await sql`
    select distinct org_id from account_roles where qualified and closed_at is null
  `) as { org_id: string }[];

  const results = [];
  for (const { org_id } of orgs) {
    const r = await verifyRoles(org_id, { limit: 150 });
    results.push({ org: org_id, ...r, closed: r.closed.length });
  }

  return Response.json({ ok: true, at: new Date().toISOString(), results });
}
