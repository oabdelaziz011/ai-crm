/**
 * Attempt direct migration history read via service role (if configured).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const paths = [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")];
  const env: Record<string, string> = {};
  for (const p of paths) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY;

async function main() {
  if (!url || !serviceKey) {
    console.log("SERVICE_ROLE: not configured in local env — cannot query supabase_migrations.schema_migrations directly");
    process.exit(0);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await admin
    .schema("supabase_migrations")
    .from("schema_migrations")
    .select("version, name")
    .order("version", { ascending: false })
    .limit(20);

  if (error) {
    console.log(`schema_migrations query error: ${error.message}`);
    process.exit(1);
  }

  console.log("Recent migrations in LIVE database:");
  for (const row of data ?? []) {
    console.log(`  ${row.version}  ${row.name ?? ""}`);
  }

  const has116 = (data ?? []).some(
    (r) =>
      String(r.version).includes("116") ||
      String(r.name ?? "").includes("116_rbac_permissions_select_fix"),
  );
  console.log(`\n116_rbac_permissions_select_fix in history: ${has116 ? "YES" : "NO"}`);
}

main().catch(console.error);
