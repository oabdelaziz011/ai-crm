/**
 * Inspect authenticated user by auth user id using their session (read-only).
 *
 * Usage: node scripts/inspect-authenticated-user.mjs [authUserId]
 * Env: AUTH_USER_ID, BROWSER_SESSION_FILE
 */
import { readFileSync } from "node:fs";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveArgOrEnv,
  resolveBrowserSessionPath,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const authUserId = resolveArgOrEnv(process.argv.slice(2), 0, ["AUTH_USER_ID"], env, "auth user id");

const sessionFile = JSON.parse(readFileSync(resolveBrowserSessionPath(root, env), "utf8"));
const accessToken = sessionFile.storageValue?.access_token;
if (!accessToken) {
  console.error("No access token in browser session file");
  process.exit(1);
}

const sb = createClient(
  requireEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
  {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  },
);

const profileColumns = "id, company_id, full_name, is_super_admin";
const byId = await sb.from("profiles").select(`${profileColumns}, email, user_id, is_active`).eq("id", authUserId).maybeSingle();
const byUserId = byId.error
  ? await sb.from("profiles").select(`${profileColumns}, email, user_id, is_active`).eq("user_id", authUserId).maybeSingle()
  : { data: null, error: null };

const profile = byId.data ?? byUserId.data ?? null;
const profileId = profile?.id ?? authUserId;

const { data: company } = profile?.company_id
  ? await sb.from("companies").select("id, name, status, subscription_status").eq("id", profile.company_id).maybeSingle()
  : { data: null };

const { data: userRoles } = await sb.from("user_roles").select("role_id").eq("user_id", profileId);
const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);

let roles = [];
if (roleIds.length) {
  const { data } = await sb.from("roles").select("id, name, company_id, is_system, role_type, template_key").in("id", roleIds);
  roles = data ?? [];
}

const permIds = new Set();
if (roleIds.length) {
  const { data: rp } = await sb.from("role_permissions").select("permission_id").in("role_id", roleIds);
  for (const row of rp ?? []) if (row.permission_id) permIds.add(row.permission_id);
}
const { data: up } = await sb.from("user_permissions").select("permission_id").eq("user_id", profileId);
for (const row of up ?? []) if (row.permission_id) permIds.add(row.permission_id);

let permissions = [];
if (permIds.size) {
  const { data } = await sb.from("permissions").select("code, module, action").in("id", [...permIds]).order("code");
  permissions = data ?? [];
}

const authContextIsSuperAdmin = profile?.is_super_admin === true;

console.log(
  JSON.stringify(
    {
      email: sessionFile.storageValue?.user?.email ?? null,
      authUserId,
      profileId,
      profiles_is_super_admin: profile?.is_super_admin ?? null,
      companyId: profile?.company_id ?? null,
      company,
      profileRow: profile,
      loadProfilePath: byId.data ? "profiles.id = auth.users.id" : byUserId.data ? "profiles.user_id = auth.users.id" : "not_found",
      roles,
      permissions: permissions.map((p) => p.code),
      permissionCount: permissions.length,
      authContextWouldReport: {
        isSuperAdmin: authContextIsSuperAdmin,
        derivation: "profile?.is_super_admin === true",
      },
      platformAiSettingsSidebarVisible: authContextIsSuperAdmin,
      dbVsReactMismatch: {
        expectedReactIsSuperAdmin: authContextIsSuperAdmin,
        note: "AuthContext reads the same profile row; no separate super-admin flag in React state",
        profileLookupErrors: { byId: byId.error?.message ?? null, byUserId: byUserId.error?.message ?? null },
      },
    },
    null,
    2,
  ),
);
