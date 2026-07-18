/**
 * Mimics EXACT auth-context.tsx loadAuthContext role ID flow.
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
    } catch {}
  }
  return env;
}

const env = loadEnv();
const client = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

await client.auth.signInWithPassword({
  email: "demo-employee@vaultos.local",
  password: "DemoVault2026!",
});
const userId = (await client.auth.getUser()).data.user!.id;

console.log("=== EXACT auth-context.tsx flow simulation ===\n");

const { data: userRoleRows } = await client.from("user_roles").select("role_id").eq("user_id", userId);
const userRoleIds = (userRoleRows ?? []).map((r) => r.role_id).filter(Boolean);
console.log("1. user_roles role_ids:", userRoleIds.length, userRoleIds);

const { data: roleRows, error: roleError } = await client
  .from("roles")
  .select("id, company_id, name, description, is_system")
  .in("id", userRoleIds);
console.log("2. roles SELECT (111 policy needs roles.view):", roleRows?.length ?? 0, roleError?.message ?? "ok");

const nextRoles = roleRows ?? [];
const roleIdsFromNextRoles = nextRoles.map((r) => r.id);
console.log("3. roleIds = nextRoles.map (auth-context L167):", roleIdsFromNextRoles.length);

let permissionIds = new Set<string>();
if (roleIdsFromNextRoles.length > 0) {
  const { data: rp } = await client
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIdsFromNextRoles);
  rp?.forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
}
console.log("4. permission IDs from role_permissions:", permissionIds.size);

if (permissionIds.size > 0) {
  const { data: perms } = await client.from("permissions").select("code").in("id", [...permissionIds]);
  console.log("5. AuthContext codes:", (perms ?? []).map((p) => p.code).join(", ") || "(empty)");
} else {
  console.log("5. AuthContext codes: (EMPTY — sidebar broken)");
}

console.log("\n--- FIX: use userRoleIds directly ---");
permissionIds = new Set<string>();
if (userRoleIds.length > 0) {
  const { data: rp } = await client
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", userRoleIds);
  rp?.forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
}
const { data: perms } = await client.from("permissions").select("code").in("id", [...permissionIds]);
console.log("Codes with fix:", (perms ?? []).map((p) => p.code).join(", "));
