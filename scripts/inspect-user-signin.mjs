/**
 * Sign in as user and inspect profile/RBAC (read-only).
 *
 * Usage: node scripts/inspect-user-signin.mjs [email] [password]
 * Env: VERIFY_EMAIL / SMOKE_EMAIL, VERIFY_PASSWORD / SMOKE_PASSWORD
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveLoginCredentials,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const email = process.argv[2]?.trim() ?? resolveLoginCredentials(env).email;
const password = process.argv[3]?.trim() ?? requireEnvValue(
  env,
  ["VERIFY_PASSWORD", "SMOKE_PASSWORD", "DEV_LOGIN_PASSWORD"],
  "login password",
);

const envLocal = {};
for (const line of readFileSync(resolve(root, "artifacts/login-app/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envLocal[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { createClient } = await import(
  "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
);

const sb = createClient(
  requireEnvValue({ ...envLocal, ...env }, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue({ ...envLocal, ...env }, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
);

const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password });
if (signInErr) {
  console.error("signIn failed:", signInErr.message);
  process.exit(1);
}

const { data: userData } = await sb.auth.getUser();
const userId = userData.user?.id ?? null;

const { data: profile } = await sb
  .from("profiles")
  .select("id, full_name, company_id, is_super_admin, email, user_id, is_active")
  .eq("id", userId)
  .maybeSingle();

const { data: userRoles } = await sb.from("user_roles").select("role_id").eq("user_id", userId);
const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);

let roles = [];
if (roleIds.length) {
  const { data } = await sb.from("roles").select("id, name, company_id, is_system").in("id", roleIds);
  roles = data ?? [];
}

const permIds = new Set();
if (roleIds.length) {
  const { data: rp } = await sb.from("role_permissions").select("permission_id").in("role_id", roleIds);
  for (const row of rp ?? []) if (row.permission_id) permIds.add(row.permission_id);
}
const { data: up } = await sb.from("user_permissions").select("permission_id").eq("user_id", userId);
for (const row of up ?? []) if (row.permission_id) permIds.add(row.permission_id);

let permissions = [];
if (permIds.size) {
  const { data } = await sb
    .from("permissions")
    .select("code, module, action")
    .in("id", [...permIds])
    .order("code");
  permissions = data ?? [];
}

console.log(
  JSON.stringify(
    {
      email,
      userId,
      profile,
      roles,
      permissions: permissions.map((p) => p.code),
    },
    null,
    2,
  ),
);
