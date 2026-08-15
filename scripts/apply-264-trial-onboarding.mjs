import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const merged = loadProjectEnv(root);
const connectionString = merged.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error("DATABASE_URL missing — set DATABASE_URL or SUPABASE_DB_PASSWORD in .env");
}

const migrationName = "264_company_trial_onboarding_provisioning.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log(`Applying ${migrationName}...`);
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("OK — migration applied");
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
