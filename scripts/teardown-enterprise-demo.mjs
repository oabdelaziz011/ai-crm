/**
 * Remove all VaultOS Enterprise Demo data safely.
 * Requires SUPABASE_SERVICE_ROLE_KEY or run in SQL editor:
 *   select public.teardown_enterprise_demo_v1();
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.log("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env, or run:");
  console.log('  select public.teardown_enterprise_demo_v1();');
  process.exit(1);
}

const { createClient } = await import(
  "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
);

const client = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await client.rpc("teardown_enterprise_demo_v1");

if (error) {
  console.error("Teardown failed:", error.message);
  process.exit(1);
}

console.log("Enterprise demo teardown complete:", JSON.stringify(data, null, 2));
