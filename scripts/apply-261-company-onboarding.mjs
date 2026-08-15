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

const sql = readFileSync(
  resolve(root, "supabase/migrations/262_company_onboarding_provisioning_bootstrap.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log("Applying 262_company_onboarding_provisioning_bootstrap.sql...");
  await client.query(sql);
  console.log("OK");
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
