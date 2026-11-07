import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { assertProductionDatabaseTls, productionDatabaseSsl } from "./production-tls";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/** Default 4 connections: one API process on a 2 GB host. Override with DATABASE_POOL_MAX (1–20). */
function poolMax(): number {
  const raw = Number(process.env.DATABASE_POOL_MAX ?? 4);
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(20, Math.trunc(raw)));
}

/** Default 10s idle. Override with DATABASE_POOL_IDLE_MS (1000–120000). */
function poolIdleMs(): number {
  const raw = Number(process.env.DATABASE_POOL_IDLE_MS ?? 10_000);
  if (!Number.isFinite(raw)) return 10_000;
  return Math.max(1_000, Math.min(120_000, Math.trunc(raw)));
}

/** Default 5s connect. Override with DATABASE_POOL_CONNECT_MS (1000–30000). */
function poolConnectMs(): number {
  const raw = Number(process.env.DATABASE_POOL_CONNECT_MS ?? 5_000);
  if (!Number.isFinite(raw)) return 5_000;
  return Math.max(1_000, Math.min(30_000, Math.trunc(raw)));
}

const connectionString = process.env.DATABASE_URL;
const productionSsl =
  process.env.NODE_ENV === "production" ? productionDatabaseSsl(connectionString) : undefined;
if (process.env.NODE_ENV === "production") {
  assertProductionDatabaseTls(connectionString);
}

/** One API process uses this pool. A second process needs its own cap so the sum stays small on a 2 GB host. These numbers are not a Supabase quota. */
export const pool = new Pool({
  connectionString,
  max: poolMax(),
  idleTimeoutMillis: poolIdleMs(),
  connectionTimeoutMillis: poolConnectMs(),
  ...(productionSsl ? { ssl: productionSsl } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
