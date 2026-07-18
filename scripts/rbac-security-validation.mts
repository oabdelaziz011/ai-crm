/**
 * Security validation for migration 116 + AuthContext RBAC bootstrap.
 * Run: tsx scripts/rbac-security-validation.mts
 *
 * Validates:
 * - No full catalog leak for ordinary users
 * - Assigned-only permission reads
 * - AuthContext merge (role + direct) with dedupe
 * - Persona alignment: frontend codes vs RPC
 * - Sidebar route visibility simulation
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_SIDEBAR_GROUPS,
  DASHBOARD_SIDEBAR_ORDER,
  getDashboardRouteById,
  isDashboardRoutePermitted,
} from "../artifacts/login-app/src/config/dashboard-route-registry.ts";

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
  { email: "demo-employee@vaultos.local", label: "Employee", expectCatalogAccess: false },
  { email: "demo-support@vaultos.local", label: "Support", expectCatalogAccess: false },
  { email: "demo-beta-admin@vaultos.local", label: "Company Admin", expectCatalogAccess: true },
  { email: "demo-platform@vaultos.local", label: "Super Admin", expectCatalogAccess: true },
];

type CheckResult = { name: string; ok: boolean; detail: string };

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function getAssignedPermissionIds(client: SupabaseClient, userId: string) {
  const ids = new Set<string>();

  const { data: userRoles } = await client.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);

  if (roleIds.length > 0) {
    const { data: rpRows } = await client.from("role_permissions").select("permission_id").in("role_id", roleIds);
    (rpRows ?? []).forEach((r) => r.permission_id && ids.add(r.permission_id));
  }

  const { data: upRows } = await client.from("user_permissions").select("permission_id").eq("user_id", userId);
  (upRows ?? []).forEach((r) => r.permission_id && ids.add(r.permission_id));

  return ids;
}

async function loadAuthContextCodes(client: SupabaseClient, userId: string) {
  const permissionIds = await getAssignedPermissionIds(client, userId);
  const ids = Array.from(permissionIds);
  if (ids.length === 0) return { codes: [] as string[], ids, duplicateCodes: [] as string[] };

  const { data: permRows, error } = await client.from("permissions").select("id, code").in("id", ids);
  if (error) throw new Error(`permissions SELECT: ${error.message}`);

  const codes = (permRows ?? []).map((p) => p.code).filter(Boolean) as string[];
  const seen = new Set<string>();
  const duplicateCodes: string[] = [];
  for (const code of codes) {
    if (seen.has(code)) duplicateCodes.push(code);
    seen.add(code);
  }

  return { codes: Array.from(seen), ids: permissionIds, duplicateCodes };
}

function simulateSidebar(codes: string[], isSuperAdmin: boolean) {
  const hasPermission = (code: string) => isSuperAdmin || codes.includes(code);
  const visible: string[] = [];
  for (const entry of DASHBOARD_SIDEBAR_ORDER) {
    if (entry.type === "group") {
      const group = DASHBOARD_SIDEBAR_GROUPS.find((item) => item.id === entry.id);
      if (!group) continue;
      for (const childId of group.childIds) {
        const route = getDashboardRouteById(childId);
        if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
          visible.push(childId);
        }
      }
      continue;
    }
    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
      visible.push(entry.id);
    }
  }
  return visible;
}

async function validatePersona(email: string, label: string, expectCatalogAccess: boolean) {
  const checks: CheckResult[] = [];
  const client = await signIn(email);
  const { data: userData } = await client.auth.getUser();
  const userId = userData.user!.id;

  const { data: profile } = await client
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  const isSuperAdmin = profile?.is_super_admin === true;

  const assignedIds = await getAssignedPermissionIds(client, userId);
  const { codes, duplicateCodes } = await loadAuthContextCodes(client, userId);

  // Catalog leak: unfiltered SELECT count
  const { count: visibleCount, error: countErr } = await client
    .from("permissions")
    .select("id", { count: "exact", head: true });
  const catalogVisible = countErr ? -1 : (visibleCount ?? 0);

  // Probe unassigned permission row
  const { data: unassignedProbe } = await client
    .from("permissions")
    .select("code")
    .eq("code", "roles.delete")
    .maybeSingle();
  const canReadUnassigned = Boolean(unassignedProbe?.code) && !codes.includes("roles.delete");

  // Full catalog estimate (only works if user has catalog access)
  const { count: totalInCatalog } = await client.from("permissions").select("id", { count: "exact", head: true });

  const hasRolesView = codes.includes("roles.view") || (await client.rpc("user_has_permission", { p_code: "roles.view" })).data === true;

  if (expectCatalogAccess) {
    checks.push({
      name: "catalog access (roles.view or super admin)",
      ok: hasRolesView || isSuperAdmin,
      detail: `roles.view=${hasRolesView} super_admin=${isSuperAdmin}`,
    });
  } else {
    checks.push({
      name: "no full catalog leak",
      ok: !hasRolesView && !isSuperAdmin && (catalogVisible <= assignedIds.size || catalogVisible === 0),
      detail: `visible=${catalogVisible} assigned=${assignedIds.size} roles.view=${hasRolesView}`,
    });
    checks.push({
      name: "cannot read unassigned permission (roles.delete)",
      ok: !canReadUnassigned,
      detail: canReadUnassigned ? "LEAK: roles.delete readable without grant" : "blocked",
    });
  }

  checks.push({
    name: "AuthContext loads all assigned permission codes",
    ok: codes.length === assignedIds.size,
    detail: `loaded=${codes.length} assigned=${assignedIds.size}`,
  });

  checks.push({
    name: "no duplicate permission codes after merge",
    ok: duplicateCodes.length === 0,
    detail: duplicateCodes.length ? duplicateCodes.join(", ") : "none",
  });

  // RPC vs frontend for sample codes
  const sampleCodes = ["users.view", "users.edit", "customers.view", "ai_chat.view", "roles.view", "knowledge.view"];
  for (const code of sampleCodes) {
    const { data: rpc } = await client.rpc("user_has_permission", { p_code: code });
    const frontend = isSuperAdmin || codes.includes(code);
    if (rpc === true || frontend === true) {
      checks.push({
        name: `frontend matches RPC for ${code}`,
        ok: frontend === rpc || isSuperAdmin,
        detail: `frontend=${frontend} rpc=${rpc}`,
      });
    }
  }

  const sidebar = simulateSidebar(codes, isSuperAdmin);
  checks.push({
    name: "sidebar has at least one route when user has permissions",
    ok: assignedIds.size === 0 || sidebar.length > 0 || isSuperAdmin,
    detail: `routes=${sidebar.join(", ") || "(none)"}`,
  });

  console.log(`\n=== ${label} (${email}) ===`);
  let failed = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    if (!c.ok) failed++;
  }
  console.log(`  Catalog rows visible: ${catalogVisible}${expectCatalogAccess ? " (catalog admin expected)" : ""}`);

  return failed;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  console.log("RBAC Security Validation (pre/post migration 116)");
  console.log("NOTE: AuthContext load checks FAIL until migration 116 is applied.\n");

  let totalFailed = 0;
  for (const p of PERSONAS) {
    totalFailed += await validatePersona(p.email, p.label, p.expectCatalogAccess);
  }

  console.log(`\n${totalFailed === 0 ? "PASS" : `FAIL (${totalFailed} checks)`}`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
