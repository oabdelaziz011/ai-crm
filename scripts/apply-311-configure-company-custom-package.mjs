import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const merged = loadProjectEnv(root);
const connectionString = merged.DATABASE_URL;
if (!connectionString?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "311_configure_company_custom_package.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = '311'`,
  );
  if (existing.rowCount > 0) {
    console.log("SKIP — migration 311 already registered");
    process.exit(0);
  }

  console.log(`Applying ${migrationName}...`);
  await client.query("begin");
  await client.query(sql);
  try {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('311', $1)
       on conflict (version) do nothing`,
      [migrationName],
    );
  } catch (regError) {
    console.warn("schema_migrations register skipped:", regError instanceof Error ? regError.message : regError);
  }
  await client.query("commit");
  console.log("OK — migration 311 applied");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
