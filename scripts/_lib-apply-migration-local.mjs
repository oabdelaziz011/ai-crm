/**
 * Shared local-only migration apply helper matching 470/471 bookkeeping:
 * - refuse non-localhost
 * - skip if version already recorded
 * - otherwise run SQL + insert schema_migrations version
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

export async function applyLocalMigration({ version, migrationFile, verifySql }) {
  const root = resolveProjectRoot(import.meta.url);
  const connectionString =
    process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
    throw new Error(`Refusing to apply migration ${version} against a production DATABASE_URL.`);
  }
  const parsed = new URL(connectionString);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error(`Refusing non-local host: ${parsed.hostname}`);
  }
  if (parsed.port && parsed.port !== "54322") {
    throw new Error(`Refusing non-local Postgres port: ${parsed.port}`);
  }

  const sql = readFileSync(resolve(root, "supabase/migrations", migrationFile), "utf8");
  const c = new pg.Client({ connectionString });
  await c.connect();
  const report = { migration: migrationFile, version, applied: false };
  try {
    const existing = await c.query(
      `select version from supabase_migrations.schema_migrations where version = $1`,
      [version],
    );
    if ((existing.rowCount ?? 0) > 0) {
      report.skipped = "already_applied";
    } else {
      await c.query("begin");
      await c.query(sql);
      await c.query(`insert into supabase_migrations.schema_migrations (version) values ($1)`, [version]);
      await c.query("commit");
      report.applied = true;
    }
    if (typeof verifySql === "function") {
      report.verify = await verifySql(c);
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try {
      await c.query("rollback");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    await c.end();
  }
}
