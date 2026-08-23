import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL missing");
}

const migrationName = "313_subscription_lifecycle_production_enforcement.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log(`Applying ${migrationName}...`);
  await client.query("begin");
  await client.query(sql);
  try {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('313', $1)
       on conflict (version) do nothing`,
      [migrationName],
    );
  } catch (regError) {
    console.warn(
      "schema_migrations register skipped:",
      regError instanceof Error ? regError.message : regError,
    );
  }
  await client.query("commit");
  console.log("OK — migration applied");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
