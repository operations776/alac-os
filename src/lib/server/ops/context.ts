import "server-only";

import { currentSession, type SessionUser } from "@/lib/server/auth";
import { opsQuery } from "@/lib/server/db";
import { atLeast } from "@/lib/ops/constants";
import type { Person, UserRole } from "@/types/ops";

// The operations workspace (the `mc` schema) is one team's board, so it is not
// scoped by org_id the way the desk tables are. Access is the verified session
// resolving to a person row, which the users trigger guarantees for every desk
// user. ARCHITECTURE.md section 11.
//
// ponytail: single tenant. A second org means org_id on mc.people and a filter
// in requirePerson, nothing else, because every ops read starts here.

export type OpsSession = { session: SessionUser; me: Person };

export async function currentPerson(): Promise<OpsSession | null> {
  const session = await currentSession();
  if (!session) return null;
  const [me] = await opsQuery<Person>("select * from mc.people where id = $1", [session.userId]);
  if (!me || me.state === "deactivated" || me.state === "suspended") return null;
  return { session, me };
}

/**
 * The permission floor that the Supabase RLS policies used to enforce. Hiding a
 * button is a convenience; this is the control. Throws a sentence the action's
 * fail() hands straight to the UI.
 */
export async function requirePerson(floor: UserRole = "viewer"): Promise<OpsSession> {
  const ctx = await currentPerson();
  if (!ctx) throw new Error("Not signed in");
  if (!atLeast(ctx.me.role, floor)) {
    throw new Error(`That needs ${floor} access. Ask an admin if you should have it.`);
  }
  return ctx;
}
