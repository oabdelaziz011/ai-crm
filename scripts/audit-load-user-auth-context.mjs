/**
 * Audit deployed load_user_auth_context function vs migration 181.
 * Run: node scripts/audit-load-user-auth-context.mjs
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSupabaseProjectRef } from "./lib/load-project-env.mjs";
import { loadSupabaseEnv, resolveProjectRoot, resolveSupabaseConfig } from "./lib/supabase-env.mjs";
import { resolveBrowserSessionPath } from "./lib/dev-script-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadSupabaseEnv(root);
const config = resolveSupabaseConfig(env);

function connectPg(databaseUrl, env) {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const projectRef =
    extractSupabaseProjectRef(parsed.hostname.startsWith("db.") ? `https://${parsed.hostname}` : env.SUPABASE_URL ?? env.VITE_SUPABASE_URL) ??
    parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1];
  if (!projectRef) {
    throw new Error("Unable to resolve Supabase project ref from DATABASE_URL or SUPABASE_URL");
  }
  const region = env.SUPABASE_REGION ?? process.env.SUPABASE_REGION ?? "eu-north-1";
  const pooler = `postgresql://postgres.${projectRef}:${parsed.password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  const client = new pg.Client({ connectionString: pooler, ssl: { rejectUnauthorized: false } });
  return client;
}

function hasProfilePreferenceFields(def) {
  return (
    def.includes("preferred_language")
    && def.includes("timezone")
    && def.includes("avatar_url")
  );
}

async function main() {
  const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const client = connectPg(databaseUrl, env);
  await client.connect();

  const { rows: fnRows } = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'load_user_auth_context'
    order by p.oid desc
    limit 1
  `);

  const deployedDef = fnRows[0]?.def ?? "";
  console.log("\n=== Deployed load_user_auth_context (excerpt) ===\n");
  const profileBlock = deployedDef.match(/jsonb_build_object\([\s\S]*?'profile'[\s\S]*?\),/);
  console.log(profileBlock?.[0]?.slice(0, 800) ?? deployedDef.slice(0, 1200));
  console.log("\nFields present:", {
    preferred_language: deployedDef.includes("preferred_language"),
    timezone: deployedDef.includes("timezone"),
    avatar_url: deployedDef.includes("avatar_url"),
  });

  const migration181 = readFileSync(
    resolve(root, "supabase/migrations/181_auth_context_profile_preferences.sql"),
    "utf8",
  );
  const migration181HasFields = hasProfilePreferenceFields(migration181);
  console.log("\nMigration 181 defines preference fields:", migration181HasFields);
  console.log("Deployed function matches migration 181:", hasProfilePreferenceFields(deployedDef));

  let migration181Applied = null;
  try {
    const { rows } = await client.query(`
      select version, name
      from supabase_migrations.schema_migrations
      where version = '181' or name like '%181_auth_context_profile_preferences%'
      order by version desc
      limit 5
    `);
    migration181Applied = rows;
    console.log("\nschema_migrations rows for 181:", rows);
  } catch (error) {
    console.log("\nschema_migrations query failed:", error.message);
  }

  // Runtime RPC via authenticated session
  let rpcProfile = null;
  if (config) {
      const sessionPath = resolveBrowserSessionPath(root, env);
    try {
      const sessionFile = JSON.parse(readFileSync(sessionPath, "utf8"));
      const accessToken = sessionFile.storageValue?.access_token;
      const userId = sessionFile.storageValue?.user?.id;
      if (accessToken && userId) {
        const { createClient } = await import(
          "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
        );
        const sb = createClient(config.url, config.key, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const { data, error } = await sb.rpc("load_user_auth_context", { p_user_id: userId });
        if (error) {
          console.log("\nRPC error:", error.message);
        } else {
          rpcProfile = data?.profile ?? null;
          console.log("\n=== Runtime RPC profile payload ===");
          console.log(JSON.stringify(rpcProfile, null, 2));
          console.log("\nRuntime profile keys:", rpcProfile ? Object.keys(rpcProfile) : []);
        }
      }
    } catch (error) {
      console.log("\nRPC session test skipped:", error.message);
    }
  }

  await client.end();

  console.log("\n=== Audit summary ===");
  console.log({
    deployedHasPreferenceFields: hasProfilePreferenceFields(deployedDef),
    migration181Applied: migration181Applied?.length ? true : false,
    runtimeProfileHasPreferredLanguage: rpcProfile?.preferred_language !== undefined,
    runtimeProfileHasTimezone: rpcProfile?.timezone !== undefined,
    runtimeProfileHasAvatarUrl: rpcProfile?.avatar_url !== undefined,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
