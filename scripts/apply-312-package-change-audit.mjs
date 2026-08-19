import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const merged = loadProjectEnv(root);
if (!merged.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");
const migrationName = "312_fix_package_change_audit_preserved_features.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");
const client = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const existing = await client.query(
    `select version from supabase_migrations.schema_migrations where version = '312'`,
  );
  if (existing.rowCount > 0) {
    console.log("SKIP — 312 already registered");
    process.exit(0);
  }
  await client.query("begin");
  await client.query(sql);
  try {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ('312', $1) on conflict (version) do nothing`,
      [migrationName],
    );
  } catch (error) {
    console.warn("schema_migrations skipped", error instanceof Error ? error.message : error);
  }
  await client.query("commit");
  console.log("OK — 312 applied");
} catch (error) {
  try { await client.query("rollback"); } catch { /* ignore */ }
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
