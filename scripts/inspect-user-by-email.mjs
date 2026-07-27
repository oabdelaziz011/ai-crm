/**
 * Inspect a specific user by email (read-only).
 * Usage: node scripts/inspect-user-by-email.mjs oabdelaziz011@gmail.com
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/inspect-user-by-email.mjs <email>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(resolve(root, "artifacts/login-app/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { createClient } = await import(
  "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
);

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

// Look up profile by email (may match auth user id or profiles.email)
const { data: profilesByEmail, error: profileEmailErr } = await sb
  .from("profiles")
  .select("id, user_id, company_id, full_name, email, is_super_admin, is_active, created_at, updated_at")
  .ilike("email", email);

const { data: profilesById } = await sb
  .from("profiles")
  .select("id, user_id, company_id, full_name, email, is_super_admin, is_active, created_at, updated_at");

// Try auth admin lookup via RPC if available - fallback: sign in not possible without password
// Query user_roles for any profile ids found
const profile =
  profilesByEmail?.[0] ??
  null;

let authUserId = profile?.user_id ?? profile?.id ?? null;

if (!profile) {
  console.log(JSON.stringify({ error: "profile_not_found_by_email", profileEmailErr: profileEmailErr?.message ?? null, email }, null, 2));
  process.exit(0);
}

const profileId = profile.id;

const { data: userRoles } = await sb.from("user_roles").select("role_id, user_id").eq("user_id", profileId);
const altUserRoles = authUserId && authUserId !== profileId
  ? (await sb.from("user_roles").select("role_id, user_id").eq("user_id", authUserId)).data
  : [];

const roleIds = [...new Set([...(userRoles ?? []), ...(altUserRoles ?? [])].map((r) => r.role_id).filter(Boolean))];

let roles = [];
if (roleIds.length) {
  const { data } = await sb.from("roles").select("id, name, company_id, is_system, role_type, template_key").in("id", roleIds);
  roles = data ?? [];
}

const permIds = new Set();
if (roleIds.length) {
  const { data: rp } = await sb.from("role_permissions").select("permission_id, role_id").in("role_id", roleIds);
  for (const row of rp ?? []) if (row.permission_id) permIds.add(row.permission_id);
}

const uidForPerms = profileId;
const { data: up } = await sb.from("user_permissions").select("permission_id").eq("user_id", uidForPerms);
for (const row of up ?? []) if (row.permission_id) permIds.add(row.permission_id);

let permissions = [];
if (permIds.size) {
  const { data } = await sb
    .from("permissions")
    .select("id, code, module, action, category")
    .in("id", [...permIds])
    .order("code");
  permissions = data ?? [];
}

let company = null;
if (profile.company_id) {
  const { data } = await sb
    .from("companies")
    .select("id, name, status, subscription_status")
    .eq("id", profile.company_id)
    .maybeSingle();
  company = data;
}

// How AuthContext resolves isSuperAdmin
const authContextIsSuperAdmin = profile.is_super_admin === true;

// loadProfile tries id first then user_id - check both profile rows
const { data: profileByUserId } = profile.user_id
  ? await sb.from("profiles").select("id, is_super_admin, email").eq("user_id", profile.user_id)
  : { data: null };

const report = {
  email,
  authUserId: profile.user_id ?? profileId,
  profileId,
  profiles_is_super_admin: profile.is_super_admin,
  companyId: profile.company_id,
  company,
  roles,
  permissions: permissions.map((p) => p.code),
  permissionCount: permissions.length,
  authContextWouldReport: {
    isSuperAdmin: authContextIsSuperAdmin,
    derivation: "profile?.is_super_admin === true (auth-context.tsx)",
  },
  loadProfileNote: {
    profileById: { id: profile.id, is_super_admin: profile.is_super_admin },
    profileByUserId: profileByUserId ?? null,
    potentialMismatch:
      profileByUserId &&
      profileByUserId.length > 1
        ? "multiple profiles for user_id"
        : profileByUserId?.[0] && profileByUserId[0].id !== profile.id
          ? "profile id vs user_id row differ"
          : null,
  },
  userRolesBinding: {
    byProfileId: userRoles ?? [],
    byAuthUserId: altUserRoles ?? [],
  },
};

console.log(JSON.stringify(report, null, 2));
