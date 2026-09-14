"use server";

import { cookies } from "next/headers";
import { tx } from "@/lib/server/db";
import { SESSION_COOKIE, currentSession, hashPassword, verifyPassword } from "@/lib/server/auth";

const MIN_LENGTH = 10;

/**
 * Change the signed-in person's password.
 *
 * The current password is required, so a borrowed unlocked laptop cannot be
 * used to take the account over. Changing it also signs out every other
 * session: the usual reason to change a password is suspecting someone else
 * has it, and leaving their session alive would defeat the point. The session
 * making the change stays signed in.
 *
 * This is desk auth (public.users, public.sessions), not an ops table, so it
 * is plain SQL through tx rather than asPerson. Two statements, one
 * transaction: a new password with the old sessions still alive is the half
 * state data law 1 exists to prevent.
 */
export async function changePassword(
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Not signed in." };

  if (typeof next !== "string" || next.length < MIN_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_LENGTH} characters.` };
  }
  if (typeof current !== "string" || !current) {
    return { ok: false, error: "Enter your current password." };
  }

  const keep = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const nextHash = await hashPassword(next);

  try {
    return await tx(async (c) => {
      // Locked, so two concurrent changes cannot both verify against the old hash.
      const { rows } = await c.query<{ password_hash: string | null }>(
        "select password_hash from users where id = $1 for update",
        [session.userId],
      );
      if (!(await verifyPassword(current, rows[0]?.password_hash ?? null))) {
        return { ok: false as const, error: "Your current password is not right." };
      }
      await c.query("update users set password_hash = $2 where id = $1", [session.userId, nextHash]);
      await c.query("delete from sessions where user_id = $1 and id is distinct from $2::uuid", [
        session.userId,
        keep,
      ]);
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Could not update the password. Try again." };
  }
}
