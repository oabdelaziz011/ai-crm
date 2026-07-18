/**
 * Full RBAC pipeline diagnostic — mirrors AuthContext + dashboard routing.
 * Run: tsx scripts/rbac-live-pipeline-diagnostic.mts [email]
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
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

const DEFAULT_EMAILS = [
  "demo-employee@vaultos.local",
  "demo-support@vaultos.local",
  "demo-beta-admin@vaultos.local",
];

function hasPermissionFromCodes(
  codes: string[],
  isSuperAdmin: boolean,
  permissionCode: string,
): boolean {
  if (isSuperAdmin) return true;
  const resolved = resolvePermissionCode(permissionCode);
  return codes.some((p) => p === permissionCode || p === resolved);
}

function buildHasPermission(codes: string[], isSuperAdmin: boolean) {
  return (permissionCode: string) => hasPermissionFromCodes(codes, isSuperAdmin, permissionCode);
}

function collectSidebarRoutes(
  codes: string[],
  isSuperAdmin: boolean,
): string[] {
  const hasPermission = buildHasPermission(codes, isSuperAdmin);
  const visible: string[] = [];
  for (const entry of DASHBOARD_SIDEBAR_ORDER) {
    if (entry.type === "group") {
      const group = DASHBOARD_SIDEBAR_GROUPS.find((g) => g.id === entry.id);
      if (!group) continue;
      for (const childId of group.childIds) {
        const route = getDashboardRouteById(childId);
        if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
          visible.push(route.id);
        }
      }
      continue;
    }
    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
      visible.push(route.id);
    }
  }
  return visible;
}

function routeRequiredPermission(route: ReturnType<typeof getDashboardRouteById>): string {
  if (route.superAdminOnly) return "super_admin";
  if (!route.permission) return "(none)";
  if (route.id === "subscriptions") return `${route.permission} OR billing.view`;
  if (route.id === "workspace") return "workspace.view OR billing.view_own OR subscriptions.view";
  return route.permission;
}

async function loadAuthContextPipeline(client: SupabaseClient, userId: string) {
  const steps: Record<string, unknown> = {};

  const { data: profile, error: profileErr } = await client
    .from("profiles")
    .select("id, company_id, is_super_admin, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  steps.profile = { data: profile, error: profileErr?.message ?? null };

  const { data: userRoles, error: userRolesErr } = await client
    .from("user_roles")
    .select("role_id, roles(id, name, company_id)")
    .eq("user_id", userId);
  steps.user_roles = { data: userRoles, error: userRolesErr?.message ?? null };

  const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);
  let rolePermissionRows: { permission_id: string }[] = [];
  if (roleIds.length > 0) {
    const { data, error } = await client
      .from("role_permissions")
      .select("permission_id, role_id")
      .in("role_id", roleIds);
    steps.role_permissions = { data, error: error?.message ?? null };
    rolePermissionRows = data ?? [];
  } else {
    steps.role_permissions = { data: [], error: null };
  }

  const { data: userPermissionRows, error: userPermErr } = await client
    .from("user_permissions")
    .select("permission_id")
    .eq("user_id", userId);
  steps.user_permissions = { data: userPermissionRows, error: userPermErr?.message ?? null };

  const permissionIds = new Set<string>();
  rolePermissionRows.forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
  (userPermissionRows ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
  steps.merged_permission_ids = Array.from(permissionIds);

  let authContextCodes: string[] = [];
  let permissionsQueryError: string | null = null;
  const idList = Array.from(permissionIds);
  if (idList.length > 0) {
    const { data: permRows, error: permErr } = await client
      .from("permissions")
      .select("id, category, module, action, code, description")
      .in("id", idList);
    permissionsQueryError = permErr?.message ?? null;
    steps.permissions_query = {
      requested_ids: idList.length,
      returned_rows: permRows?.length ?? 0,
      error: permissionsQueryError,
      codes: (permRows ?? []).map((p) => p.code).filter(Boolean),
    };
    authContextCodes = (permRows ?? []).map((p) => p.code).filter(Boolean) as string[];
  } else {
    steps.permissions_query = {
      requested_ids: 0,
      returned_rows: 0,
      error: null,
      codes: [],
    };
  }

  return {
    profile: profile as {
      id: string;
      company_id: string | null;
      is_super_admin: boolean;
      full_name: string | null;
      email: string | null;
    } | null,
    userRoles: userRoles ?? [],
    steps,
    authContextCodes,
    permissionsQueryError,
    permissionIdCount: idList.length,
  };
}

function findFirstBreak(steps: Record<string, unknown>, authContextCodes: string[], permissionIdCount: number) {
  const ur = steps.user_roles as { data: unknown[]; error: string | null };
  const rp = steps.role_permissions as { data: unknown[]; error: string | null };
  const pq = steps.permissions_query as {
    requested_ids: number;
    returned_rows: number;
    error: string | null;
  };

  if (ur.error) return { location: "user_roles query", detail: ur.error };
  if (!ur.data?.length) return { location: "user_roles (empty)", detail: "No roles assigned to user" };
  if (rp.error) return { location: "role_permissions query", detail: rp.error };
  if (!rp.data?.length) return { location: "role_permissions (empty)", detail: "Role has no permissions" };
  if (permissionIdCount === 0) return { location: "AuthContext merge", detail: "permissionIds Set is empty" };
  if (pq.error) {
    return {
      location: "auth-context.tsx permissions SELECT (~L205-208)",
      detail: pq.error,
    };
  }
  if (pq.returned_rows < pq.requested_ids) {
    return {
      location: "auth-context.tsx permissions SELECT (~L205-208) — RLS on public.permissions",
      detail: `Requested ${pq.requested_ids} permission IDs, RLS returned ${pq.returned_rows} (migration 113/116 permissions_select_policy)`,
    };
  }
  if (authContextCodes.length === 0) {
    return { location: "AuthContext setPermissions", detail: "Empty permission codes after successful query" };
  }
  return null;
}

async function diagnoseEmail(email: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) {
    console.log(`\n########## ${email} — SIGN IN FAILED: ${signInErr.message} ##########\n`);
    return;
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("No user id after sign in");

  const pipeline = await loadAuthContextPipeline(client, userId);
  const isSuperAdmin = pipeline.profile?.is_super_admin === true;
  const hasPermission = buildHasPermission(pipeline.authContextCodes, isSuperAdmin);
  const sidebarRoutes = collectSidebarRoutes(pipeline.authContextCodes, isSuperAdmin);
  const firstBreak = findFirstBreak(pipeline.steps, pipeline.authContextCodes, pipeline.permissionIdCount);

  console.log(`\n${"=".repeat(72)}`);
  console.log(`LIVE PIPELINE: ${email}`);
  console.log("=".repeat(72));

  console.log("\n1. Profile");
  console.log(`   user id:     ${userId}`);
  console.log(`   company id:  ${pipeline.profile?.company_id ?? "(null)"}`);
  console.log(`   super admin: ${isSuperAdmin}`);
  console.log(`   name:        ${pipeline.profile?.full_name ?? "(none)"}`);

  console.log("\n2. Assigned Roles");
  if (pipeline.userRoles.length === 0) {
    console.log("   (none)");
  } else {
    for (const row of pipeline.userRoles) {
      const role = row.roles as { id?: string; name?: string; company_id?: string } | null;
      console.log(`   - ${role?.name ?? row.role_id} (role_id=${row.role_id}, company_id=${role?.company_id ?? "?"})`);
    }
  }

  console.log("\n3. Role Permissions");
  const rp = pipeline.steps.role_permissions as { data: { permission_id: string; role_id: string }[] };
  console.log(`   count: ${rp.data?.length ?? 0}`);
  if (rp.data?.length) {
    console.log(`   permission_ids: ${rp.data.map((r) => r.permission_id).join(", ")}`);
  }

  console.log("\n4. Direct User Permissions");
  const up = pipeline.steps.user_permissions as { data: { permission_id: string }[] };
  console.log(`   count: ${up.data?.length ?? 0}`);

  console.log("\n5. Final permission codes in AuthContext");
  console.log(`   merged IDs: ${pipeline.permissionIdCount}`);
  console.log(`   codes (${pipeline.authContextCodes.length}): ${pipeline.authContextCodes.join(", ") || "(EMPTY)"}`);

  console.log("\n6. hasPermission() results (from AuthContext codes)");
  for (const code of ["customers.view", "users.view", "roles.view", "knowledge.view", "ai_chat.view"]) {
    const frontend = hasPermission(code);
    const { data: rpc } = await client.rpc("user_has_permission", { p_code: code });
    const match = frontend === rpc || isSuperAdmin ? "OK" : "MISMATCH";
    console.log(`   hasPermission("${code}"): ${frontend}  (RPC: ${rpc}) ${match === "MISMATCH" ? "← UI BROKEN" : ""}`);
  }

  console.log("\n7. Visible dashboard routes (sidebar)");
  console.log(`   ${sidebarRoutes.length ? sidebarRoutes.join(", ") : "(none — matches 'noSections' message)"}`);

  console.log("\n8. Every dashboard route");
  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    const required = routeRequiredPermission(route);
    const allowed = isDashboardRoutePermitted(route, isSuperAdmin, hasPermission);
    const inSidebar = sidebarRoutes.includes(route.id);
    console.log(`   Route: ${route.id}`);
    console.log(`   ↓ Required: ${required}`);
    console.log(`   ↓ hasPermission: ${route.permission ? hasPermission(route.permission) : route.superAdminOnly ? isSuperAdmin : true}`);
    console.log(`   ↓ ${allowed ? "VISIBLE" : "HIDDEN"}${inSidebar ? " (in sidebar)" : ""}`);
    console.log("");
  }

  console.log("-".repeat(72));
  if (firstBreak) {
    console.log("FIRST BREAK IN PIPELINE:");
    console.log(`   Location: ${firstBreak.location}`);
    console.log(`   Detail:   ${firstBreak.detail}`);
  } else if (sidebarRoutes.length === 0 && !isSuperAdmin) {
    console.log("FIRST BREAK IN PIPELINE:");
    console.log("   Location: dashboard-route-registry / role permissions vs route requirements");
    console.log("   Detail:   AuthContext has codes but none match any route permission");
  } else {
    console.log("PIPELINE: OK — permissions flow through to sidebar");
  }
  console.log("-".repeat(72));
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  const emails = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_EMAILS;
  console.log("RBAC Live Pipeline Diagnostic");
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Personas: ${emails.join(", ")}`);

  for (const email of emails) {
    await diagnoseEmail(email);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
