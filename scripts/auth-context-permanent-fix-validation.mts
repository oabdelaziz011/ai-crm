/**
 * Validates permanent auth-context permission pipeline fix.
 * Run: tsx scripts/auth-context-permanent-fix-validation.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_SIDEBAR_ORDER,
  DASHBOARD_SIDEBAR_GROUPS,
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
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = "DemoVault2026!";

type Result = { scenario: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(scenario: string, ok: boolean, detail: string) {
  results.push({ scenario, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${scenario} — ${detail}`);
}

/** Mirrors refactored auth-context.tsx loadAuthContext permission path */
async function loadPermissionsPipeline(client: SupabaseClient, userId: string) {
  const { data: userRoleRows } = await client.from("user_roles").select("role_id").eq("user_id", userId);
  const assignedRoleIds = (userRoleRows ?? []).map((r) => r.role_id).filter(Boolean) as string[];

  const { data: roleRows } = await client
    .from("roles")
    .select("id")
    .in("id", assignedRoleIds.length ? assignedRoleIds : ["00000000-0000-0000-0000-000000000000"]);

  const permissionIds = new Set<string>();
  if (assignedRoleIds.length > 0) {
    const { data: rp } = await client
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", assignedRoleIds);
    (rp ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));
  }

  const { data: up } = await client.from("user_permissions").select("permission_id").eq("user_id", userId);
  (up ?? []).forEach((r) => r.permission_id && permissionIds.add(r.permission_id));

  const ids = [...permissionIds];
  let codes: string[] = [];
  if (ids.length > 0) {
    const { data: perms } = await client.from("permissions").select("code").in("id", ids);
    codes = (perms ?? []).map((p) => p.code).filter(Boolean) as string[];
  }

  return {
    assignedRoleIds,
    rolesMetadataCount: roleRows?.length ?? 0,
    permissionIdCount: ids.length,
    codes,
    rolesSelectBlocked: assignedRoleIds.length > 0 && (roleRows?.length ?? 0) === 0,
  };
}

function sidebarRoutes(codes: string[], isSuperAdmin: boolean) {
  const hasPermission = (code: string) =>
    isSuperAdmin || codes.some((p) => p === code || p === resolvePermissionCode(code));
  const visible: string[] = [];
  for (const entry of DASHBOARD_SIDEBAR_ORDER) {
    if (entry.type === "group") {
      const group = DASHBOARD_SIDEBAR_GROUPS.find((g) => g.id === entry.id);
      group?.childIds.forEach((id) => {
        const route = getDashboardRouteById(id);
        if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) visible.push(id);
      });
    } else {
      const route = getDashboardRouteById(entry.id);
      if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) visible.push(entry.id);
    }
  }
  return visible;
}

async function signIn(email: string) {
  const client = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function main() {
  if (!URL || !KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  console.log("AuthContext Permanent Fix — Pipeline Validation\n");

  // Fresh login — employee (one role, no roles.view)
  {
    const client = await signIn("demo-employee@vaultos.local");
    const userId = (await client.auth.getUser()).data.user!.id;
    const p = await loadPermissionsPipeline(client, userId);
    record(
      "Fresh login — user with one role",
      p.permissionIdCount > 0 && p.codes.length > 0 && sidebarRoutes(p.codes, false).length > 0,
      `assignedRoleIds=${p.assignedRoleIds.length} codes=${p.codes.length} sidebar=${sidebarRoutes(p.codes, false).join(",")}`,
    );
    record(
      "Permissions independent of roles SELECT",
      p.permissionIdCount > 0,
      `roles metadata=${p.rolesMetadataCount}, permissions=${p.permissionIdCount} (uses user_roles.role_id)`,
    );
  }

  // Browser refresh — new client, persisted session simulation via signIn again
  {
    const client = await signIn("demo-employee@vaultos.local");
    const userId = (await client.auth.getUser()).data.user!.id;
    const p = await loadPermissionsPipeline(client, userId);
    record(
      "Browser refresh (INITIAL_SESSION reload path)",
      p.codes.includes("customers.view") && p.codes.includes("bookings.view"),
      `codes=${p.codes.join(", ")}`,
    );
  }

  // Token refresh — session still valid, permissions reloadable
  {
    const client = await signIn("demo-support@vaultos.local");
    const { data: refreshed } = await client.auth.refreshSession();
    const userId = refreshed.session?.user?.id;
    const p = await loadPermissionsPipeline(client, userId!);
    record(
      "Token refresh — permissions reload",
      p.codes.includes("customers.view") && p.codes.includes("ai_chat.view"),
      `codes=${p.codes.length} after refreshSession`,
    );
  }

  // Company admin — multiple permissions
  {
    const client = await signIn("demo-beta-admin@vaultos.local");
    const userId = (await client.auth.getUser()).data.user!.id;
    const p = await loadPermissionsPipeline(client, userId);
    record(
      "User with one role (admin, many permissions)",
      p.codes.length >= 10 && sidebarRoutes(p.codes, false).length >= 5,
      `codes=${p.codes.length} sidebar=${sidebarRoutes(p.codes, false).length} routes`,
    );
  }

  // Super admin
  {
    const client = await signIn("demo-platform@vaultos.local");
    const userId = (await client.auth.getUser()).data.user!.id;
    const p = await loadPermissionsPipeline(client, userId);
    record(
      "Super admin path",
      sidebarRoutes(p.codes, true).length >= 10,
      `sidebar routes=${sidebarRoutes(p.codes, true).length}`,
    );
  }

  // Simulated: roles SELECT returns 0 but user_roles has IDs — pipeline still loads permissions
  {
    const client = await signIn("demo-employee@vaultos.local");
    const userId = (await client.auth.getUser()).data.user!.id;
    const { data: ur } = await client.from("user_roles").select("role_id").eq("user_id", userId);
    const assignedRoleIds = (ur ?? []).map((r) => r.role_id).filter(Boolean);
    const { data: roleRows } = await client.from("roles").select("id").in("id", assignedRoleIds);
    const { data: rp } = await client
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", assignedRoleIds);
    const permIds = [...new Set((rp ?? []).map((r) => r.permission_id))];
    const { data: perms } = await client.from("permissions").select("code").in("id", permIds);
    const codes = (perms ?? []).map((p) => p.code).filter(Boolean);
    const wouldOldFlowFail = assignedRoleIds.length > 0 && (roleRows?.length ?? 0) === 0;
    record(
      "role_permissions uses user_roles.role_id (not roles query)",
      codes.length > 0,
      `assignedRoleIds=${assignedRoleIds.length} rolesMetadata=${roleRows?.length ?? 0} codes=${codes.length}${wouldOldFlowFail ? " (old flow would fail here)" : ""}`,
    );
  }

  // Logout/login cycle
  {
    const client = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.signInWithPassword({ email: "demo-employee@vaultos.local", password: PASSWORD });
    await client.auth.signOut();
    const afterSignOut = (await client.auth.getSession()).data.session;
    await client.auth.signInWithPassword({ email: "demo-employee@vaultos.local", password: PASSWORD });
    const userId = (await client.auth.getUser()).data.user!.id;
    const p = await loadPermissionsPipeline(client, userId);
    record(
      "Logout/login cycle",
      !afterSignOut?.user && p.codes.length > 0,
      `post-login codes=${p.codes.length}`,
    );
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
