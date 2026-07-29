/**
 * Apply Sprint AI.3 tool migrations (185, 186) to live Supabase.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);

function resolveDatabaseUrl() {
  const merged = loadProjectEnv(root);
  const url = merged.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL missing — set DATABASE_URL or SUPABASE_DB_PASSWORD in .env");
  }
  return url;
}

const connectionString = resolveDatabaseUrl();

const files = [
  resolve(root, "supabase/migrations/185_search_availability_tool.sql"),
  resolve(root, "supabase/migrations/186_create_booking_tool.sql"),
  resolve(root, "supabase/migrations/187_platform_ai_runtime_service_role.sql"),
];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  console.log(`Applying ${file.split(/[/\\]/).pop()}...`);
  await client.query(sql);
  console.log("OK");
}

const verify = await client.query(`
  select key, is_enabled
  from public.tool_definitions
  where key in ('search_availability', 'create_booking', 'appointment_lookup', 'booking')
  order by key
`);

console.log("\nVerification:");
console.table(verify.rows);

await client.end();
