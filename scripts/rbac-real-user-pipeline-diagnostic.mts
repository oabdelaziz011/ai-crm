/**
 * Real-user RBAC pipeline diagnostic — mirrors auth-context.tsx exactly.
 * Usage: tsx scripts/rbac-real-user-pipeline-diagnostic.mts <email> <password>
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_SIDEBAR_GROUPS,
  DASHBOARD_SIDEBAR_ORDER,
  getDashboardRouteById,
  isDashboardRoutePermitted,
} from "../artifacts/login-app/src/config/dashboard-route-registry.ts";
import { resolvePermissionCode } from "../artifacts/login-app/src/lib/rbac/permission-aliases.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env: Record<string, string> = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("Usage: tsx scripts/rbac-real-user-pipeline-diagnostic.mts <email> <password>");
  process.exit(2);
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(2);
}

function printSection(title: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(title);
  console.log("=".repeat(72));
}

function printRows(label: string, rows: unknown[] | null | undefined, error: string | null = null) {
  console.log(`\n${label}`);
  if (error) {
    console.log(`Error: ${error}`);
    return;
  }
  const list = rows ?? [];
  console.log(`Returned:`);
  console.log(`${list.length} row${list.length === 1 ? "" : "s"}`);
  for (const row of list) {
    console.log(JSON.stringify(row, null, 2));
  }
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error) {
  console.error(`SIGN IN FAILED: ${signIn.error.message}`);
  process.exit(1);
}

const userId = signIn.data.user?.id;
if (!userId) {
  console.error("No user id after sign-in");
  process.exit(1);
}

printSection(`REAL USER PIPELINE: ${email}`);
console.log(`auth.users id: ${userId}`);

// 1 Profile — mirrors loadProfile (id then user_id)
let profile = null;
let profileError: string | null = null;
{
  const byId = await client.from("profiles").select("id, company_id, full_name, is_super_admin, email").eq("id", userId).maybeSingle();
  if (!byId.error && byId.data) {
    profile = byId.data;
  } else {
    const byUserId = await client
      .from("profiles")
      .select("id, company_id, full_name, is_super_admin, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (byUserId.error) profileError = byUserId.error.message;
    else profile = byUserId.data;
  }
}
printSection("1. Profile");
if (profileError) console.log(`Error: ${profileError}`);
else if (!profile) console.log("Returned:\n0 rows");
else {
  console.log("Returned:\n1 row");
  console.log(JSON.stringify(profile, null, 2));
}

// 2 Company
printSection("2. Company");
let company = null;
if (profile?.company_id) {
  const { data, error } = await client
    .from("companies")
    .select("id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (error) console.log(`Error: ${error.message}`);
  else if (!data) console.log("Returned:\n0 rows");
  else {
    console.log("Returned:\n1 row");
    console.log(JSON.stringify(data, null, 2));
    company = data;
  }
} else {
  console.log("Returned:\n0 rows (profile.company_id is null)");
}

// 3 user_roles
printSection("3. user_roles");
const { data: userRoleRows, error: userRoleError } = await client
  .from("user_roles")
  .select("role_id, user_id")
  .eq("user_id", userId);
printRows("user_roles", userRoleRows, userRoleError?.message ?? null);

const assignedRoleIds = (userRoleRows ?? []).map((r) => r.role_id).filter(Boolean) as string[];

// 4 roles (metadata SELECT — separate from permission path)
printSection("4. roles");
let roleRows: unknown[] = [];
if (assignedRoleIds.length > 0) {
  const { data, error } = await client
    .from("roles")
    .select("id, company_id, name, description, is_system")
    .in("id", assignedRoleIds);
  printRows("roles", data, error?.message ?? null);
  roleRows = data ?? [];
} else {
  console.log("Returned:\n0 rows (no assignedRoleIds)");
}

// 5 role_permissions — uses assignedRoleIds from user_roles
printSection("5. role_permissions");
let rolePermissionRows: { permission_id: string }[] = [];
if (assignedRoleIds.length > 0) {
  const { data, error } = await client
    .from("role_permissions")
    .select("permission_id, role_id")
    .in("role_id", assignedRoleIds);
  printRows("role_permissions", data, error?.message ?? null);
  rolePermissionRows = data ?? [];
} else {
  console.log("Returned:\n0 rows (no assignedRoleIds)");
}

// 6 user_permissions
printSection("6. user_permissions (direct grants)");
const { data: userPermissionRows, error: userPermError } = await client
  .from("user_permissions")
  .select("permission_id")
  .eq("user_id", userId);
printRows("user_permissions", userPermissionRows, userPermError?.message ?? null);

const permissionIds = new Set<string>();
rolePermissionRows.forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
(userPermissionRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));

// 7 permissions rows
printSection("7. permissions rows");
let permissionRows: { id: string; code: string | null }[] = [];
const idList = [...permissionIds];
if (idList.length > 0) {
  const { data, error } = await client
    .from("permissions")
    .select("id, category, module, action, code, description")
    .in("id", idList);
  printRows("permissions", data, error?.message ?? null);
  permissionRows = (data ?? []) as typeof permissionRows;
} else {
  console.log("Returned:\n0 rows (permissionIds set is empty — query skipped)");
}

// 8 Permission codes
printSection("8. Permission codes");
const codes = permissionRows.map((p) => p.code).filter(Boolean) as string[];
console.log(`Count: ${codes.length}`);
for (const code of codes) console.log(`  ${code}`);
if (codes.length === 0) console.log("(empty)");

// 9 AuthContext permissions
printSection("9. AuthContext permissions");
console.log(`permissions array length: ${permissionRows.length}`);
console.log(JSON.stringify(permissionRows, null, 2));

// 10 Sidebar routes
printSection("10. Sidebar routes");
const isSuperAdmin = profile?.is_super_admin === true;
const hasPermission = (code: string) =>
  isSuperAdmin || codes.some((p) => p === code || p === resolvePermissionCode(code));
const sidebarVisible: string[] = [];
for (const entry of DASHBOARD_SIDEBAR_ORDER) {
  if (entry.type === "group") {
    const group = DASHBOARD_SIDEBAR_GROUPS.find((g) => g.id === entry.id);
    group?.childIds.forEach((id) => {
      const route = getDashboardRouteById(id);
      if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) sidebarVisible.push(id);
    });
  } else {
    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) sidebarVisible.push(route.id);
  }
}
console.log(`Visible routes (${sidebarVisible.length}): ${sidebarVisible.length ? sidebarVisible.join(", ") : "(none — noSections message)"}`);

// Diagnosis
printSection("FIRST UNEXPECTED QUERY");
if (userRoleError) {
  console.log("user_roles query error");
} else if ((userRoleRows ?? []).length === 0) {
  console.log("user_roles returned 0 rows — no role assigned");
} else if (roleRows.length === 0 && assignedRoleIds.length > 0) {
  console.log("roles metadata returned 0 rows (RLS — does NOT block permissions if role_permissions works)");
} else if (rolePermissionRows.length === 0 && assignedRoleIds.length > 0) {
  console.log("role_permissions returned 0 rows — THIS EMPTY permissionIds → empty AuthContext");
  if (roleRows.length > 0) {
    const role = roleRows[0] as { company_id?: string; name?: string };
    console.log(`profile.company_id = ${profile?.company_id ?? "null"}`);
    console.log(`role.company_id   = ${role.company_id ?? "null"}`);
    if (profile?.company_id && role.company_id && profile.company_id !== role.company_id) {
      console.log("ROOT CAUSE: Cross-company role assignment — role_permissions_select_policy blocks reads");
      console.log("CLASSIFICATION: DATA CREATION (wrong role assigned to user for their company)");
    }
  }
} else if (idList.length > 0 && permissionRows.length < idList.length) {
  console.log("permissions SELECT returned fewer rows than requested — RLS on permissions table");
} else if (codes.length > 0 && sidebarVisible.length === 0) {
  console.log("Permissions loaded but no sidebar routes match — route registry mismatch");
} else if (codes.length === 0) {
  console.log("Empty permission codes end-to-end");
} else {
  console.log("Pipeline OK for this user");
}

void company;
