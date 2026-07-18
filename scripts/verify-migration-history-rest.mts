/**
 * Query live migration history via PostgREST schema probe + policy behavior.
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
const URL_BASE = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY;

async function fetchMigrationHistory(key: string, label: string) {
  const res = await fetch(`${URL_BASE}/rest/v1/schema_migrations?select=version,name&order=version.desc&limit=30`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "supabase_migrations",
      Accept: "application/json",
    },
  });
  const text = await res.text();
  return { label, status: res.status, body: text.slice(0, 2000) };
}

async function fetchPolicyViaPgPolicies(key: string, label: string) {
  // PostgREST won't expose pg_policies; try graphql or rpc if ever added
  const res = await fetch(
    `${URL_BASE}/rest/v1/rpc/get_permissions_policy_definition`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  const text = await res.text();
  return { label, status: res.status, body: text.slice(0, 500) };
}

async function main() {
  console.log("=== Migration history probes ===\n");

  if (ANON) {
    const anon = await fetchMigrationHistory(ANON, "anon");
    console.log(`[${anon.label}] HTTP ${anon.status}`);
    console.log(anon.body.slice(0, 400));
    console.log("");
  }

  if (SERVICE) {
    const svc = await fetchMigrationHistory(SERVICE, "service_role");
    console.log(`[${svc.label}] HTTP ${svc.status}`);
    console.log(svc.body);
    const has116 =
      svc.body.includes("116") && svc.body.includes("rbac_permissions_select_fix");
    console.log(`\n116 in service_role history response: ${has116 ? "YES" : "NO"}`);
  } else {
    console.log("service_role key: NOT in local env");
  }

  if (SERVICE) {
    const pol = await fetchPolicyViaPgPolicies(SERVICE, "service");
    console.log(`\nPolicy RPC probe: HTTP ${pol.status} ${pol.body}`);
  }
}

main().catch(console.error);
