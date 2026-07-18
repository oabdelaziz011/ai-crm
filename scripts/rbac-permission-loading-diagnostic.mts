/**
 * Diagnose RBAC permission loading for demo personas.
 * Run: tsx scripts/rbac-permission-loading-diagnostic.mts
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
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = "DemoVault2026!";

const PERSONAS = [
  { email: "demo-employee@vaultos.local", label: "Employee" },
  { email: "demo-beta-admin@vaultos.local", label: "Company Admin" },
  { email: "demo-support@vaultos.local", label: "Support" },
];

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function diagnosePersona(email: string, label: string) {
  console.log(`\n=== ${label} (${email}) ===`);
  const client = await signIn(email);
  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("No user id");

  const { data: profile } = await client
    .from("profiles")
    .select("is_super_admin, company_id")
    .eq("id", userId)
    .maybeSingle();
  console.log(`Profile: super_admin=${profile?.is_super_admin} company_id=${profile?.company_id}`);

  const { data: userRoles, error: urErr } = await client
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", userId);
  console.log(`user_roles: ${urErr ? `ERROR ${urErr.message}` : userRoles?.length ?? 0} rows`);
  if (userRoles?.length) {
    for (const row of userRoles) {
      const role = row.roles as { name?: string } | null;
      console.log(`  - role: ${role?.name ?? row.role_id}`);
    }
  }

  const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);
  let permissionIds: string[] = [];
  if (roleIds.length > 0) {
    const { data: rpRows, error: rpErr } = await client
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    console.log(`role_permissions: ${rpErr ? `ERROR ${rpErr.message}` : rpRows?.length ?? 0} rows`);
    permissionIds = (rpRows ?? []).map((r) => r.permission_id).filter(Boolean);
  }

  const { data: directPerms, error: upErr } = await client
    .from("user_permissions")
    .select("permission_id")
    .eq("user_id", userId);
  console.log(`user_permissions: ${upErr ? `ERROR ${upErr.message}` : directPerms?.length ?? 0} rows`);

  const allIds = [...new Set([...permissionIds, ...(directPerms ?? []).map((r) => r.permission_id)])];
  console.log(`Unique permission IDs from roles+direct: ${allIds.length}`);

  if (allIds.length > 0) {
    const { data: permRows, error: pErr } = await client
      .from("permissions")
      .select("code")
      .in("id", allIds);
    if (pErr) {
      console.log(`permissions SELECT: ERROR ${pErr.message} ← AUTH CONTEXT BREAKS HERE`);
    } else {
      const codes = (permRows ?? []).map((p) => p.code).filter(Boolean);
      console.log(`permissions SELECT: ${codes.length} codes loaded`);
      console.log(`  codes: ${codes.slice(0, 15).join(", ")}${codes.length > 15 ? "..." : ""}`);
      if (codes.length < allIds.length) {
        console.log(`  ⚠ RLS BLOCKED ${allIds.length - codes.length} permission rows (expected ${allIds.length}, got ${codes.length})`);
      }
    }
  }

  const checks = ["users.view", "users.edit", "roles.view", "customers.view", "ai_chat.view"];
  for (const code of checks) {
    const { data, error } = await client.rpc("user_has_permission", { p_code: code });
    console.log(`  RPC user_has_permission('${code}'): ${error ? `ERROR ${error.message}` : data}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }
  console.log("RBAC Permission Loading Diagnostic");
  console.log("Simulates auth-context.tsx loadAuthContext() flow\n");

  for (const p of PERSONAS) {
    await diagnosePersona(p.email, p.label);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
