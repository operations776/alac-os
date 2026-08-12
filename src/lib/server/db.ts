import "server-only";

import { neon } from "@neondatabase/serverless";
import { Pool, type PoolClient } from "pg";

// The only module in the app that reads a connection string. Everything else
// goes through sql() or tx(). ARCHITECTURE.md section 3.
//
// Two connections, and the difference is not cosmetic:
//   DATABASE_URL           pooled through PgBouncer, for request handlers
//   DATABASE_URL_UNPOOLED  direct, for migrations and long imports, which need
//                          session level state the pooler does not carry
//
// The pooled client is HTTP based, so it has no session and cannot hold a
// transaction open. Anything transactional therefore uses tx(), which takes a
// real pg client from the unpooled pool.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`vercel env pull .env.local\`, or copy .env.example and fill it in.`,
    );
  }
  return value;
}

/**
 * Read queries and single statement writes. Tagged template, parameterized by
 * the driver, so interpolated values are never concatenated into SQL.
 *
 *   const rows = await sql`select * from accounts where org_id = ${orgId}`;
 */
export const sql = neon(required("DATABASE_URL"));

// One pool per process. Serverless keeps the module alive between invocations
// on a warm instance, so building a pool per call would exhaust connections.
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: required("DATABASE_URL_UNPOOLED"),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // A pool that emits an error with no listener takes the process down.
    pool.on("error", (err) => {
      console.error("[db] idle client error", err);
    });
  }
  return pool;
}

/**
 * Run a function inside one transaction. Data law 1: any write touching two or
 * more tables uses this. Commits on success, rolls back on any throw, and
 * always releases the client.
 *
 *   await tx(async (c) => {
 *     await c.query("update accounts set tier = $1 where id = $2", [tier, id]);
 *     await c.query("insert into activities (...) values (...)");
 *   });
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    // A rollback failure must not mask the error that caused it.
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      console.error("[db] rollback failed", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** A direct, unpooled client for migrations and importers. Caller ends it. */
export function directPool(): Pool {
  return new Pool({ connectionString: required("DATABASE_URL_UNPOOLED"), max: 1 });
}
