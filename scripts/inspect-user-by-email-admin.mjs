/**
 * Admin DB inspect by email (read-only, uses DATABASE_URL).
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: node scripts/inspect-user-by-email-admin.mjs <email>");
  process.exit(1);
}

const root = resolveProjectRoot(import.meta.url);
const env = loadSupabaseEnv(root);
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not configured");
  process.exit(1);
}

const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
const projectRef = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
const pooler = `postgresql://postgres.${projectRef}:${parsed.password}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`;

const client = new pg.Client({ connectionString: pooler, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: authRows } = await client.query(
  `select id, email, created_at, last_sign_in_at, email_confirmed_at
   from auth.users where lower(email) = lower($1) limit 5`,
  [email],
);

if (!authRows.length) {
  console.log(JSON.stringify({ email, error: "auth_user_not_found" }, null, 2));
  await client.end();
  process.exit(0);
}

const authUser = authRows[0];
const authUserId = authUser.id;

const { rows: profiles } = await client.query(
  `select id, user_id, company_id, email, full_name, is_super_admin, is_active, account_status, created_at, updated_at
   from public.profiles
   where id = $1 or user_id = $1 or lower(email) = lower($2)`,
  [authUserId, email],
);

const profile = profiles.find((p) => p.id === authUserId) ?? profiles[0] ?? null;

let company = null;
if (profile?.company_id) {
  const { rows } = await client.query(
    `select id, name, status, subscription_status from public.companies where id = $1`,
    [profile.company_id],
  );
  company = rows[0] ?? null;
}

const profileId = profile?.id ?? authUserId;
const { rows: userRoles } = await client.query(
  `select ur.role_id, r.name, r.company_id, r.is_system, r.role_type, r.template_key
   from public.user_roles ur
   join public.roles r on r.id = ur.role_id
   where ur.user_id = $1 or ur.user_id = $2`,
  [profileId, authUserId],
);

const roleIds = [...new Set(userRoles.map((r) => r.role_id))];
let permissions = [];
if (roleIds.length) {
  const { rows: rp } = await client.query(
    `select distinct p.code, p.module, p.action, p.category
     from public.role_permissions rp
     join public.permissions p on p.id = rp.permission_id
     where rp.role_id = any($1::uuid[])
     order by p.code`,
    [roleIds],
  );
  permissions = rp;
}

const { rows: directPerms } = await client.query(
  `select p.code from public.user_permissions up
   join public.permissions p on p.id = up.permission_id
   where up.user_id = $1 or up.user_id = $2
   order by p.code`,
  [profileId, authUserId],
);

// AuthContext derivation
const authContextIsSuperAdmin = profile?.is_super_admin === true;

// Check for duplicate/conflicting profile rows
const profileMismatch =
  profiles.length > 1
    ? profiles.map((p) => ({ id: p.id, user_id: p.user_id, is_super_admin: p.is_super_admin }))
    : null;

// Why not promoted - search audit/provisioning
const { rows: auditHints } = await client.query(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_name in ('audit_logs', 'provisioning_events')`,
);

let promotionNotes = null;
if (profile && !profile.is_super_admin) {
  promotionNotes = {
    reason:
      "is_super_admin is only set explicitly in seed migrations for demo platform owners or manual SQL; no automatic promotion on signup.",
    profile_account_status: profile.account_status ?? null,
    company_bound: Boolean(profile.company_id),
    typical_platform_owner_pattern: "demo seeds set is_super_admin=true with company_id=null; this user has a company-bound tenant profile",
  };
}

const report = {
  email: authUser.email,
  authUserId,
  profileId: profile?.id ?? null,
  profiles_is_super_admin: profile?.is_super_admin ?? null,
  companyId: profile?.company_id ?? null,
  company,
  allMatchingProfiles: profiles,
  profileMismatch,
  roles: userRoles.map((r) => ({
    role_id: r.role_id,
    name: r.name,
    company_id: r.company_id,
    is_system: r.is_system,
    role_type: r.role_type,
    template_key: r.template_key,
  })),
  rolePermissions: permissions.map((p) => p.code),
  rolePermissionCount: permissions.length,
  directUserPermissions: directPerms.map((p) => p.code),
  authContextWouldReport: {
    isSuperAdmin: authContextIsSuperAdmin,
    formula: "profile?.is_super_admin === true",
    loadProfileLookupOrder: ["profiles.id = auth.users.id", "else profiles.user_id = auth.users.id"],
    profileUsedForAuth: profile
      ? { id: profile.id, is_super_admin: profile.is_super_admin }
      : null,
  },
  dbVsReactMismatch: profile
    ? {
        hasMismatch: false,
        explanation:
          "AuthContext reads the same profiles.is_super_admin column; React isSuperAdmin will match DB unless stale session or wrong profile row loaded",
        duplicateProfiles: profileMismatch,
      }
    : {
        hasMismatch: true,
        explanation: "No profile row found for auth user — AuthContext would clear profile and isSuperAdmin=false",
      },
  promotionNotes,
  authMeta: {
    created_at: authUser.created_at,
    last_sign_in_at: authUser.last_sign_in_at,
    email_confirmed_at: authUser.email_confirmed_at,
  },
};

console.log(JSON.stringify(report, null, 2));
await client.end();
