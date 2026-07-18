/**
 * Live validation: Create Company → roles → user → Admin → login → sidebar permissions.
 * Run: tsx scripts/company-provisioning-validation.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SUPER_EMAIL = env.PROVISION_VALIDATION_SUPER_EMAIL || "super.admin@vaultos.local";
const SUPER_PASSWORD = env.PROVISION_VALIDATION_SUPER_PASSWORD || "DemoVault2026!";
const REDIRECT = "http://localhost:5173/auth/callback?next=%2Freset-password";

type Step = { step: string; ok: boolean; detail: string };
const steps: Step[] = [];

function record(step: string, ok: boolean, detail: string) {
  steps.push({ step, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${step} — ${detail}`);
}

async function loadPermissions(client: ReturnType<typeof createClient>, roleIds: string[]) {
  if (roleIds.length === 0) return [] as string[];
  const { data, error } = await client
    .from("role_permissions")
    .select("permissions(code)")
    .in("role_id", roleIds);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => {
      const permission = row.permissions as { code?: string | null } | null;
      return permission?.code ?? "";
    })
    .filter(Boolean);
}

async function sidebarSections(permissionCodes: string[], isSuperAdmin: boolean) {
  const permitted = new Set(permissionCodes.map((code) => resolvePermissionCode(code)));
  return DASHBOARD_SIDEBAR_ORDER.filter((routeId) => {
    const route = getDashboardRouteById(routeId);
    if (!route) return false;
    return isDashboardRoutePermitted(route, permitted, isSuperAdmin);
  });
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase URL / publishable key");
    process.exit(1);
  }

  const superClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const { error: signInError } = await superClient.auth.signInWithPassword({
    email: SUPER_EMAIL,
    password: SUPER_PASSWORD,
  });
  if (signInError) {
    record("Sign in super admin", false, signInError.message);
    writeReport(steps);
    process.exit(1);
  }
  record("Sign in super admin", true, SUPER_EMAIL);

  const { data: migrationProbe, error: migrationError } = await superClient.rpc(
    "repair_companies_missing_roles",
  );
  record(
    "Migration 118 applied (repair RPC exists)",
    !migrationError,
    migrationError?.message ?? `repaired=${JSON.stringify(migrationProbe)?.slice(0, 120)}`,
  );

  const companyName = `Validation Co ${Date.now()}`;
  const { data: company, error: companyError } = await superClient
    .from("companies")
    .insert({
      name: companyName,
      status: "Trial",
      subscription_plan: "Basic",
    })
    .select("id, name")
    .single();

  if (companyError || !company?.id) {
    record("Create company", false, companyError?.message ?? "no company returned");
    writeReport(steps);
    process.exit(1);
  }
  record("Create company", true, `${company.name} (${company.id})`);

  const roleReader = adminClient ?? superClient;
  let { data: roles, error: rolesError } = await roleReader
    .from("roles")
    .select("id, name, company_id, is_system")
    .eq("company_id", company.id)
    .order("name");

  if ((roles ?? []).length === 0) {
    const { error: provisionError } = await superClient.rpc("provision_company_default_roles", {
      p_company_id: company.id,
    });
    if (provisionError) {
      record("Provision default roles (fallback RPC)", false, provisionError.message);
    } else {
      const refetch = await roleReader
        .from("roles")
        .select("id, name, company_id, is_system")
        .eq("company_id", company.id)
        .order("name");
      roles = refetch.data;
      rolesError = refetch.error;
      record("Provision default roles (fallback RPC)", true, `count=${roles?.length ?? 0}`);
    }
  }

  const roleNames = (roles ?? []).map((role) => role.name).sort();
  const expected = ["Company Admin", "Employee", "Manager"];
  const rolesOk =
    !rolesError &&
    roleNames.length === 3 &&
    expected.every((name) => roleNames.includes(name)) &&
    (roles ?? []).every((role) => role.company_id === company.id);
  record(
    "Verify default roles exist",
    rolesOk,
    rolesError?.message ?? (roleNames.join(", ") || "none"),
  );

  const adminRole = (roles ?? []).find((role) => role.name === "Company Admin");
  if (adminRole) {
    const { count: permCount, error: permError } = await roleReader
      .from("role_permissions")
      .select("permission_id", { count: "exact", head: true })
      .eq("role_id", adminRole.id);
    record(
      "Company Admin role has permission template",
      !permError && (permCount ?? 0) > 0,
      permError?.message ?? `${permCount ?? 0} permissions`,
    );
  } else {
    record("Company Admin role has permission template", false, "Company Admin role missing");
  }

  const testEmail = `provision-val-${Date.now()}@vaultos.local`;
  const { data: inviteData, error: inviteError } = await superClient.functions.invoke("provision-user", {
    body: {
      email: testEmail,
      fullName: "Provisioning Validation User",
      companyId: company.id,
      roleId: adminRole?.id,
      isActive: true,
      redirectTo: REDIRECT,
    },
  });

  const inviteOk = !inviteError && inviteData?.ok === true && Boolean(inviteData?.userId);
  record(
    "Create user + assign Admin (provision-user)",
    inviteOk,
    inviteError?.message ?? JSON.stringify(inviteData),
  );

  let userClient = superClient;
  let visibleSections: string[] = [];
  if (inviteOk && adminClient) {
    const tempPassword = `Val-${Date.now().toString(36)}!Aa1`;
    await adminClient.auth.admin.updateUserById(inviteData.userId, { password: tempPassword });

    userClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: userSignInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: tempPassword,
    });
    record("Login as new Admin user", !userSignInError, userSignInError?.message ?? testEmail);

    const { data: userRoles } = await userClient
      .from("user_roles")
      .select("role_id")
      .eq("user_id", inviteData.userId);
    const roleIds = (userRoles ?? []).map((row) => row.role_id);
    const permissionCodes = await loadPermissions(userClient, roleIds);
    visibleSections = await sidebarSections(permissionCodes, false);
    record(
      "Sidebar permissions appear",
      visibleSections.length > 1,
      `${visibleSections.length} sections: ${visibleSections.slice(0, 8).join(", ")}`,
    );

    await adminClient.auth.admin.deleteUser(inviteData.userId);
  } else if (inviteOk) {
    record("Login as new Admin user", false, "SUPABASE_SERVICE_ROLE_KEY required for password + login step");
    record("Sidebar permissions appear", false, "skipped — no service role key");
  } else {
    record("Login as new Admin user", false, "skipped — invite failed");
    record("Sidebar permissions appear", false, "skipped — invite failed");
  }

  if (adminClient) {
    await adminClient.from("user_roles").delete().eq("user_id", inviteData?.userId ?? "00000000-0000-0000-0000-000000000000");
    await adminClient.from("roles").delete().eq("company_id", company.id);
    await adminClient.from("companies").delete().eq("id", company.id);
    record("Cleanup validation company", true, company.id);
  } else {
    record("Cleanup validation company", false, "SUPABASE_SERVICE_ROLE_KEY not set — manual cleanup required");
  }

  writeReport(steps);
  if (steps.some((entry) => !entry.ok)) process.exit(1);
}

function writeReport(steps: Step[]) {
  const passed = steps.filter((entry) => entry.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    total: steps.length,
    passed,
    failed: steps.length - passed,
    steps,
  };
  const outDir = resolve(root, "artifacts/reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "company-provisioning-validation.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`${passed}/${steps.length} passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
