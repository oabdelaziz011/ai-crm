/**
 * Frontend pipeline diagnostic — exact auth-context.tsx steps + sidebar trace.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_ROUTE_REGISTRY,
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
const env = loadEnv();
const email = process.argv[2] ?? "demo-employee@vaultos.local";

const client = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});
await client.auth.signInWithPassword({ email, password: "DemoVault2026!" });
const userId = (await client.auth.getUser()).data.user!.id;

console.log("FRONTEND PIPELINE DIAGNOSTIC — mirrors auth-context.tsx exactly\n");

const { data: profile } = await client
  .from("profiles")
  .select("id, company_id, full_name, is_super_admin")
  .eq("id", userId)
  .maybeSingle();
console.log("1. Profile:", JSON.stringify(profile, null, 2));

const { data: userRoleRows, error: userRoleError } = await client
  .from("user_roles")
  .select("role_id, roles(name)")
  .eq("user_id", userId);
console.log("\n2. Assigned Roles:", userRoleError?.message ?? userRoleRows);

  const assignedRoleIds = (userRoleRows ?? []).map((r) => r.role_id).filter(Boolean) as string[];
  let nextRoles: RoleRecord[] = [];
  if (assignedRoleIds.length > 0) {
    const { data: roleRows, error: roleError } = await client
      .from("roles")
      .select("id, company_id, name, description, is_system")
      .in("id", assignedRoleIds);
    console.log("\n3. roles SELECT (metadata only):", roleError?.message ?? `${roleRows?.length ?? 0} rows`);
    nextRoles = (roleRows ?? []) as RoleRecord[];
  } else {
    console.log("\n3. roles SELECT (metadata only): skipped — no user_roles");
  }

  console.log("\n4. assignedRoleIds from user_roles (source of truth):", assignedRoleIds);

  const permissionIds = new Set<string>();
  if (assignedRoleIds.length > 0) {
    const { data: rpRows } = await client
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", assignedRoleIds);
    console.log("\n5. role_permissions IDs (via assignedRoleIds):", (rpRows ?? []).map((r) => r.permission_id));
    (rpRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
  } else {
    console.log("\n5. role_permissions IDs: (none — user has no roles)");
  }

const { data: upRows } = await client.from("user_permissions").select("permission_id").eq("user_id", userId);
(upRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
console.log("\n6. Direct user_permissions IDs:", (upRows ?? []).map((r) => r.permission_id));

const idList = [...permissionIds];
let authContextCodes: string[] = [];
if (idList.length > 0) {
  const { data: permRows, error: permError } = await client
    .from("permissions")
    .select("id, code")
    .in("id", idList);
  console.log("\n7. permissions table rows:", permError?.message ?? `${permRows?.length ?? 0}/${idList.length}`);
  authContextCodes = (permRows ?? []).map((p) => p.code).filter(Boolean) as string[];
}
console.log("\n8. AuthContext codes:", authContextCodes.length ? authContextCodes : "(EMPTY)");
console.log("9. permissions Set:", [...new Set(authContextCodes)]);

const isSuperAdmin = profile?.is_super_admin === true;
const hasPermission = (code: string) =>
  isSuperAdmin || authContextCodes.some((p) => p === code || p === resolvePermissionCode(code));

console.log("\n10. hasPermission:");
for (const code of ["customers.view", "bookings.view", "users.view", "roles.view"]) {
  console.log(`    ${code}: ${hasPermission(code)}`);
}

console.log("\n11. Dashboard routes:");
const sidebarVisible: string[] = [];
for (const route of DASHBOARD_ROUTE_REGISTRY) {
  const allowed = isDashboardRoutePermitted(route, isSuperAdmin, hasPermission);
  const req = route.permission ?? (route.superAdminOnly ? "super_admin" : "(none)");
  console.log(`    ${route.id} | required: ${req} | hasPermission: ${route.permission ? hasPermission(route.permission) : !route.superAdminOnly} | ${allowed ? "VISIBLE" : "HIDDEN"}`);
}
for (const entry of DASHBOARD_SIDEBAR_ORDER) {
  if (entry.type === "group") {
    const group = DASHBOARD_SIDEBAR_GROUPS.find((g) => g.id === entry.id);
    group?.childIds.forEach((id) => {
      const route = getDashboardRouteById(id);
      if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) sidebarVisible.push(id);
    });
  } else {
    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) sidebarVisible.push(entry.id);
  }
}
console.log("\n12. Sidebar visible:", sidebarVisible.length ? sidebarVisible.join(", ") : "(NONE → noSections message)");

  if (assignedRoleIds.length > 0 && permissionIds.size === 0) {
    console.log("\nFIRST FAILING LINE: auth-context.tsx role_permissions query");
  } else if (permissionIds.size > 0 && authContextCodes.length === 0) {
    console.log("\nFIRST FAILING LINE: auth-context.tsx permissions SELECT");
  } else if (authContextCodes.length === 0 && assignedRoleIds.length === 0) {
    console.log("\nEXPECTED: user has no roles — empty permissions and sidebar");
  } else if (authContextCodes.length > 0 && sidebarVisible.length === 0) {
    console.log("\nFIRST FAILING LINE: dashboard-route-registry — codes don't match routes");
  } else {
    console.log("\nPIPELINE OK");
  }
