/**
 * Inspect demo users super-admin status and RBAC (read-only).
 *
 * Required env:
 *   VERIFY_USER_EMAILS — comma-separated emails
 *   VERIFY_PASSWORD or SMOKE_PASSWORD — shared password for each account
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveCommaSeparatedEnv,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const emails = resolveCommaSeparatedEnv(
  env,
  ["VERIFY_USER_EMAILS"],
  "user emails (VERIFY_USER_EMAILS, comma-separated)",
);
const password = requireEnvValue(
  env,
  ["VERIFY_PASSWORD", "SMOKE_PASSWORD", "DEV_LOGIN_PASSWORD"],
  "login password (VERIFY_PASSWORD or SMOKE_PASSWORD)",
);

const sb = createClient(
  requireEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
);

async function inspectUser(email) {
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { email, signIn: signInError.message };
  }

  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id ?? null;

  const { data: profile } = await sb
    .from("profiles")
    .select("id, full_name, company_id, is_super_admin, email")
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

  await sb.auth.signOut();

  return {
    email,
    userId,
    profile,
    isSuperAdmin: profile?.is_super_admin === true,
    roles: roles.map((r) => ({ name: r.name, is_system: r.is_system, company_id: r.company_id })),
    permissionCount: permissions.length,
    permissions: permissions.map((p) => p.code).slice(0, 20),
  };
}

const results = [];
for (const email of emails) {
  results.push(await inspectUser(email));
}

console.log(JSON.stringify(results, null, 2));
