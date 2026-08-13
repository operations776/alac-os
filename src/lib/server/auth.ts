import "server-only";

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { sql, tx } from "@/lib/server/db";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "alac_session";
const SESSION_DAYS = 30;
const KEYLEN = 64;

/**
 * scrypt with a per-user salt, stored as `scrypt:<salt hex>:<hash hex>`.
 * The algorithm is recorded in the string so a future upgrade can rehash on
 * next sign-in instead of locking everyone out.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Constant-time compare. A plain === leaks how many leading bytes matched,
 * which over enough attempts recovers the hash.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface SessionUser {
  userId: string;
  orgId: string;
  email: string;
  fullName: string;
  role: string;
}

/**
 * The verified session, or null. Every tenant-scoped query takes its orgId
 * from here, never from a URL or a form field. ARCHITECTURE.md section 3.
 *
 * Expiry is enforced in the query rather than trusted from the cookie, so a
 * stale cookie simply resolves to no session.
 */
export async function currentSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // A malformed cookie must not throw: uuid comparison against a non-uuid
  // raises in Postgres, so shape-check before it reaches SQL.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

  const rows = (await sql`
    select s.id, u.id as user_id, u.email, u.full_name,
           m.org_id, m.role::text as role
      from sessions s
      join users u on u.id = s.user_id
      join org_memberships m on m.user_id = u.id
     where s.id = ${token} and s.expires_at > now()
     order by m.created_at
     limit 1
  `) as {
    id: string;
    user_id: string;
    email: string;
    full_name: string;
    org_id: string;
    role: string;
  }[];

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    orgId: row.org_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
  };
}

/** Sign in. Returns null on bad credentials, without saying which half failed. */
export async function signIn(
  email: string,
  password: string,
  userAgent: string | null,
): Promise<SessionUser | null> {
  const rows = (await sql`
    select id, email, full_name, password_hash from users
     where lower(email) = lower(${email}) limit 1
  `) as {
    id: string;
    email: string;
    full_name: string;
    password_hash: string | null;
  }[];

  const user = rows[0];
  // Hash even when the user does not exist, so a missing account and a wrong
  // password take the same time and the endpoint cannot be used to enumerate
  // who has an account here.
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok) return null;

  const [membership] = (await sql`
    select org_id, role::text as role from org_memberships
     where user_id = ${user.id} order by created_at limit 1
  `) as { org_id: string; role: string }[];
  if (!membership) return null;

  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const [session] = (await sql`
    insert into sessions (user_id, expires_at, user_agent)
    values (${user.id}, ${expires.toISOString()}, ${userAgent})
    returning id
  `) as { id: string }[];

  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  await sql`update users set last_seen_at = now() where id = ${user.id}`;

  return {
    userId: user.id,
    orgId: membership.org_id,
    email: user.email,
    fullName: user.full_name,
    role: membership.role,
  };
}

/** Delete the row, not just the cookie. A signed-out session must be dead server side. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    await sql`delete from sessions where id = ${token}`;
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Create a user and their membership in one transaction. Two tables, so data
 * law 1 applies: a user with no membership can sign in but belongs nowhere.
 */
export async function createUser(
  orgId: string,
  email: string,
  password: string,
  fullName: string,
  role = "owner",
): Promise<string> {
  const passwordHash = await hashPassword(password);
  return tx(async (client) => {
    const { rows } = await client.query(
      `insert into users (email, password_hash, full_name)
       values ($1, $2, $3) returning id`,
      [email, passwordHash, fullName],
    );
    const userId = rows[0].id as string;
    await client.query(
      `insert into org_memberships (org_id, user_id, role)
       values ($1, $2, $3::org_role)
       on conflict (org_id, user_id) do nothing`,
      [orgId, userId, role],
    );
    return userId;
  });
}
