/**
 * Live E2E: manager/super-admin resets a DISPOSABLE employee password.
 * NEVER targets CVP / Nessma / production tenant employees.
 *
 * Run: tsx scripts/reset-employee-password-e2e.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: true });

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PLATFORM_PASSWORD = "DemoVault2026!";
const PLATFORM_EMAILS = ["super.admin@vaultos.local", "demo-platform@vaultos.local"];
const OLD_PASSWORD = "OldEmpPass2026!";
const NEW_PASSWORD = "NewEmpPass2026!";
const MANAGER_PASSWORD = "MgrEmpPass2026!";
const STAFF_PASSWORD = "StaffEmpPass2026!";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
}

function adminClient() {
  return createClient(SUPABASE_URL!, SERVICE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient() {
  return createClient(SUPABASE_URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return { client, data, error };
}

async function signInPlatform(): Promise<{ client: SupabaseClient; email: string }> {
  for (const email of PLATFORM_EMAILS) {
    const { client, error } = await signIn(email, PLATFORM_PASSWORD);
    if (!error) {
      const { data: profile } = await client
        .from("profiles")
        .select("is_super_admin")
        .eq("email", email)
        .maybeSingle();
      if (profile?.is_super_admin === true) {
        return { client, email };
      }
    }
  }
  throw new Error("Could not sign in as platform super admin with known demo credentials");
}

async function invokeReset(
  client: SupabaseClient,
  body: Record<string, unknown>,
) {
  return client.functions.invoke("reset-employee-password", { body });
}

function denied(error: { message?: string } | null, data: { ok?: unknown; error?: unknown } | null) {
  return Boolean(error) || data?.ok !== true || Boolean(data?.error);
}

async function grantPermission(svc: SupabaseClient, roleId: string, code: string) {
  const { data: permission, error } = await svc
    .from("permissions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error || !permission?.id) {
    throw new Error(`permission ${code} missing: ${error?.message ?? "not found"}`);
  }
  const { error: grantError } = await svc.from("role_permissions").insert({
    role_id: roleId,
    permission_id: permission.id,
  });
  if (grantError && !/duplicate|unique/i.test(grantError.message)) {
    throw new Error(`grant ${code} failed: ${grantError.message}`);
  }
}

async function createAuthUser(
  svc: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
) {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user?.id) {
    throw new Error(error?.message ?? `createUser failed for ${email}`);
  }
  return data.user.id;
}

async function upsertEmployeeProfile(
  svc: SupabaseClient,
  userId: string,
  email: string,
  fullName: string,
  companyId: string,
) {
  const { error } = await svc.from("profiles").upsert({
    id: userId,
    user_id: userId,
    email,
    full_name: fullName,
    company_id: companyId,
    is_active: true,
    is_super_admin: false,
  });
  if (error) throw new Error(error.message);
}

async function assignRole(svc: SupabaseClient, userId: string, roleId: string) {
  const { error } = await svc.from("user_roles").insert({
    user_id: userId,
    role_id: roleId,
  });
  if (!error) return;
  const { error: rpcError } = await svc.rpc("replace_user_role", {
    p_user_id: userId,
    p_role_id: roleId,
  });
  if (rpcError) throw new Error(`${error.message} / ${rpcError.message}`);
}

async function main() {
  if (!SUPABASE_URL || !ANON || !SERVICE) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const svc = adminClient();
  const stamp = Date.now();
  const companyName = `Disposable Reset Employee ${stamp}`;
  const employeeEmail = `disp.reset.emp.${stamp}@valueor-test.local`;
  const managerEmail = `disp.reset.mgr.${stamp}@valueor-test.local`;
  const staffEmail = `disp.reset.staff.${stamp}@valueor-test.local`;
  let companyId: string | null = null;
  let employeeId: string | null = null;
  let managerId: string | null = null;
  let staffId: string | null = null;
  let adminRoleId: string | null = null;
  let staffRoleId: string | null = null;
  let platformEmail = "";

  try {
    const platform = await signInPlatform();
    platformEmail = platform.email;
    record("platform_super_admin_signin", true, platformEmail);

    const { data: company, error: companyError } = await svc
      .from("companies")
      .insert({
        name: companyName,
        status: "Active",
        approval_status: "approved",
        contact_email: `contact.reset.emp.${stamp}@example.invalid`,
        subscription_plan: "Basic",
      })
      .select("id")
      .single();

    if (companyError || !company?.id) {
      record("create_disposable_company", false, companyError?.message ?? "insert failed");
      throw new Error("company create failed");
    }
    companyId = company.id;
    record("create_disposable_company", true, companyId);

    await new Promise((r) => setTimeout(r, 800));

    let { data: adminRole } = await svc
      .from("roles")
      .select("id")
      .eq("company_id", companyId)
      .eq("template_key", "admin")
      .maybeSingle();

    if (!adminRole?.id) {
      const inserted = await svc
        .from("roles")
        .insert({
          company_id: companyId,
          name: "Admin",
          template_key: "admin",
          is_system: true,
        })
        .select("id")
        .single();
      adminRole = inserted.data;
    }
    if (!adminRole?.id) throw new Error("admin role missing");
    adminRoleId = adminRole.id;
    record("resolve_admin_role", true, adminRoleId);

    const { data: staffRole, error: staffRoleError } = await svc
      .from("roles")
      .insert({
        company_id: companyId,
        name: "Staff",
        role_type: "CUSTOM",
        is_system: false,
      })
      .select("id")
      .single();
    if (staffRoleError || !staffRole?.id) {
      throw new Error(staffRoleError?.message ?? "staff role missing");
    }
    staffRoleId = staffRole.id;
    record("create_staff_role", true, staffRoleId);

    await grantPermission(svc, adminRoleId, "employees.manage");
    record("grant_employees_manage_to_admin", true, "ok");

    employeeId = await createAuthUser(svc, employeeEmail, OLD_PASSWORD, "Disposable Employee");
    managerId = await createAuthUser(svc, managerEmail, MANAGER_PASSWORD, "Disposable Manager");
    staffId = await createAuthUser(svc, staffEmail, STAFF_PASSWORD, "Disposable Staff");
    record("create_disposable_auth_users", true, `emp=${employeeId} mgr=${managerId} staff=${staffId}`);

    await upsertEmployeeProfile(svc, employeeId, employeeEmail, "Disposable Employee", companyId);
    await upsertEmployeeProfile(svc, managerId, managerEmail, "Disposable Manager", companyId);
    await upsertEmployeeProfile(svc, staffId, staffEmail, "Disposable Staff", companyId);
    record("upsert_profiles", true, "ok");

    await assignRole(svc, managerId, adminRoleId);
    await assignRole(svc, employeeId, staffRoleId);
    await assignRole(svc, staffId, staffRoleId);
    record("assign_roles", true, "manager=admin staff=staff");

    const oldSession = await signIn(employeeEmail, OLD_PASSWORD);
    record(
      "old_password_authenticates_before_reset",
      !oldSession.error && Boolean(oldSession.data.session?.access_token),
      oldSession.error?.message ?? "session ok",
    );
    const oldRefresh = oldSession.data.session?.refresh_token ?? null;

    const weak = await invokeReset(platform.client, {
      companyId,
      targetUserId: employeeId,
      newPassword: "short1A",
      confirmPassword: "short1A",
    });
    record(
      "weak_password_rejected",
      denied(weak.error, weak.data) && (weak.data?.error === "password_policy" || Boolean(weak.error)),
      JSON.stringify({ error: weak.error?.message, data: weak.data }),
    );

    const mismatch = await invokeReset(platform.client, {
      companyId,
      targetUserId: employeeId,
      newPassword: NEW_PASSWORD,
      confirmPassword: "OtherPass2026!",
    });
    record(
      "password_mismatch_rejected",
      denied(mismatch.error, mismatch.data),
      JSON.stringify({ error: mismatch.error?.message, data: mismatch.data }),
    );

    const staffCaller = await signIn(staffEmail, STAFF_PASSWORD);
    if (staffCaller.error) {
      record("staff_caller_signin", false, staffCaller.error.message);
    } else {
      record("staff_caller_signin", true, "ok");
      const staffDenied = await invokeReset(staffCaller.client, {
        companyId,
        targetUserId: employeeId,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      record(
        "staff_without_permission_denied",
        denied(staffDenied.error, staffDenied.data),
        JSON.stringify({ error: staffDenied.error?.message, data: staffDenied.data }),
      );
    }

    const managerCaller = await signIn(managerEmail, MANAGER_PASSWORD);
    if (managerCaller.error) {
      record("manager_caller_signin", false, managerCaller.error.message);
      throw new Error(managerCaller.error.message);
    }
    record("manager_caller_signin", true, "ok");

    const { data: resetData, error: resetError } = await invokeReset(managerCaller.client, {
      companyId,
      targetUserId: employeeId,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const resetOk =
      !resetError &&
      resetData?.ok === true &&
      resetData?.targetUserId === employeeId &&
      String(resetData?.targetEmail).toLowerCase() === employeeEmail.toLowerCase();
    record(
      "company_manager_reset_succeeds",
      resetOk,
      resetError?.message ?? JSON.stringify({
        ok: resetData?.ok,
        targetUserId: resetData?.targetUserId,
        targetEmail: resetData?.targetEmail,
        hasPassword: Boolean(resetData?.password || resetData?.newPassword),
      }),
    );
    record(
      "response_never_includes_password",
      resetOk && !("password" in (resetData ?? {})) && !("newPassword" in (resetData ?? {})),
      "checked response keys",
    );

    const oldAfter = await signIn(employeeEmail, OLD_PASSWORD);
    record(
      "old_password_fails_after_reset",
      Boolean(oldAfter.error),
      oldAfter.error?.message ?? "UNEXPECTED: old password still works",
    );

    const newAfter = await signIn(employeeEmail, NEW_PASSWORD);
    record(
      "new_password_succeeds_after_reset",
      !newAfter.error && Boolean(newAfter.data.session),
      newAfter.error?.message ?? "session ok",
    );

    if (oldRefresh) {
      const refreshClient = anonClient();
      const { error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: oldRefresh,
      });
      record(
        "old_refresh_token_revoked",
        Boolean(refreshError),
        refreshError?.message ?? "UNEXPECTED: refresh still valid",
      );
    } else {
      record("old_refresh_token_revoked", false, "no prior refresh token captured");
    }

    const missing = await invokeReset(platform.client, {
      companyId,
      targetUserId: "00000000-0000-4000-8000-000000000099",
      newPassword: "MissingPass2026!",
      confirmPassword: "MissingPass2026!",
    });
    record(
      "unknown_target_rejected",
      denied(missing.error, missing.data),
      JSON.stringify({ error: missing.error?.message, data: missing.data }),
    );

    const { data: audits } = await svc
      .from("audit_logs")
      .select("id, entity, action, entity_id, metadata, created_at")
      .eq("entity", "employee_password_reset")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8);

    const successAudit = (audits ?? []).find((a) => a.metadata?.result === "success");
    const auditBlob = JSON.stringify(audits ?? []);
    const passwordLeak = /NewEmpPass2026|OldEmpPass2026|password["']?\s*:/i.test(auditBlob);
    record(
      "audit_success_recorded",
      Boolean(successAudit) && String(successAudit?.entity_id) === employeeId,
      successAudit ? `id=${successAudit.id}` : "missing success audit",
    );
    record("audit_never_contains_password", !passwordLeak, passwordLeak ? "LEAK" : "clean");

    const { data: profileRow } = await svc.from("profiles").select("*").eq("id", employeeId!).single();
    const appLeak = JSON.stringify({ profileRow }).includes(NEW_PASSWORD);
    record("password_not_in_app_tables", !appLeak, appLeak ? "LEAK" : "clean");
  } catch (error) {
    record("suite_aborted", false, error instanceof Error ? error.message : String(error));
  } finally {
    try {
      for (const userId of [employeeId, managerId, staffId]) {
        if (!userId) continue;
        await svc.from("user_roles").delete().eq("user_id", userId);
        await svc.from("profiles").delete().eq("id", userId);
        await svc.auth.admin.deleteUser(userId);
      }
      if (companyId) {
        await svc.from("audit_logs").delete().eq("company_id", companyId).eq("entity", "employee_password_reset");
        if (staffRoleId) await svc.from("role_permissions").delete().eq("role_id", staffRoleId);
        if (adminRoleId) await svc.from("role_permissions").delete().eq("role_id", adminRoleId);
        await svc.from("roles").delete().eq("company_id", companyId);
        await svc.from("companies").delete().eq("id", companyId);
      }
      record("cleanup_disposable", true, `company=${companyId}`);
    } catch (cleanupError) {
      record(
        "cleanup_disposable",
        false,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      );
    }
  }

  const outPath = resolve(root, "scripts/_tmp-reset-employee-password-e2e.out.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        platformEmail,
        companyId,
        employeeId,
        managerId,
        staffId,
        employeeEmail,
        checks,
        pass: checks.every((c) => c.ok),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${outPath}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`FAILED ${failed.length}/${checks.length}`);
    process.exit(1);
  }
  console.log(`ALL PASS ${checks.length}/${checks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
