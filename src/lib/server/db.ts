import "server-only";

import { neon } from "@neondatabase/serverless";
import { Pool, types as pgTypes, type PoolClient, type QueryConfig } from "pg";

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
export const sql = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL ?? "")
  ? localSql()
  : neon(required("DATABASE_URL"));

/**
 * The same interface over plain pg, for a local Postgres. The Neon HTTP driver
 * can only reach Neon, so without this the app cannot run against a database
 * on this machine, which is the only safe place to exercise a new schema.
 */
function localSql() {
  const run = async (text: string, params: unknown[] = [], opts?: { types?: unknown }) =>
    (await getPool().query({ text, values: params, types: opts?.types } as QueryConfig)).rows;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((acc, s, i) => `${acc}$${i}${s}`), values);
  return Object.assign(tag, { query: run }) as unknown as ReturnType<typeof neon>;
}

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

// ---------------------------------------------------------------------------
// Operations (the Mission Control schema, `mc`)
// ---------------------------------------------------------------------------

// The ported operations UI was written against PostgREST, which hands back
// timestamps as ISO strings and numerics as numbers. pg's defaults are Date
// objects and strings, which break `.slice(0, 10)` on a date and arithmetic on
// a fee. These parsers restore the shape the UI expects, for ops reads only,
// so nothing the desk already reads changes under it.
const OPS_TYPES = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    switch (oid) {
      case 1082: // date: keep YYYY-MM-DD, never a local-midnight Date
        return (v: string) => v;
      case 1114: // timestamp
      case 1184: // timestamptz
        return (v: string) => new Date(pgTypes.getTypeParser(oid, "text")(v) as Date).toISOString();
      case 20: // int8
      case 1700: // numeric
        return (v: string) => Number(v);
      default:
        return pgTypes.getTypeParser(oid, format as "text");
    }
  },
};

export type OpsQuery = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** Ops reads. Parameterized text, because the ported filters are built up conditionally. */
export const opsQuery: OpsQuery = async (text, params = []) =>
  (await sql.query(text, params, { types: OPS_TYPES } as never)) as never;

/**
 * Ops writes. One transaction, with `mc.uid()` set to the acting person so
 * every trigger (activity, notifications, review tasks) attributes the change
 * to them and never notifies them about their own action. Data law 1.
 */
export async function asPerson<T>(userId: string, fn: (q: OpsQuery) => Promise<T>): Promise<T> {
  return tx(async (client) => {
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const q: OpsQuery = async (text, params = []) =>
      (await client.query({ text, values: params, types: OPS_TYPES } as QueryConfig)).rows as never;
    return fn(q);
  });
}

/** A direct, unpooled client for migrations and importers. Caller ends it. */
export function directPool(): Pool {
  return new Pool({ connectionString: required("DATABASE_URL_UNPOOLED"), max: 1 });
}
