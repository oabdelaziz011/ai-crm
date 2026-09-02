/**
 * Live E2E: Super Admin resets a DISPOSABLE company admin password.
 * NEVER targets CVP / Nessma / production tenant admins.
 *
 * Run: tsx scripts/reset-company-admin-password-e2e.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: true });

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PLATFORM_PASSWORD = "DemoVault2026!";
const PLATFORM_EMAILS = ["super.admin@vaultos.local", "demo-platform@vaultos.local"];
const OLD_PASSWORD = "OldAdminPass2026!";
const NEW_PASSWORD = "NewAdminPass2026!";
const CONTACT_EMAIL = `contact.reset.${Date.now()}@example.invalid`;

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

async function main() {
  if (!SUPABASE_URL || !ANON || !SERVICE) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const svc = adminClient();
  const stamp = Date.now();
  const companyName = `Disposable Reset Admin ${stamp}`;
  const adminEmail = `disp.reset.admin.${stamp}@valueor-test.local`;
  let companyId: string | null = null;
  let adminUserId: string | null = null;
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
        contact_email: CONTACT_EMAIL,
        subscription_plan: "Basic",
      })
      .select("id, contact_email")
      .single();

    if (companyError || !company?.id) {
      record("create_disposable_company", false, companyError?.message ?? "insert failed");
      throw new Error("company create failed");
    }
    companyId = company.id;
    record(
      "create_disposable_company",
      true,
      `id=${companyId}; contact_email=${company.contact_email} (must differ from login)`,
    );

    // Wait briefly for role seed triggers if any
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

    if (!adminRole?.id) {
      record("resolve_admin_role", false, "no admin role");
      throw new Error("admin role missing");
    }
    record("resolve_admin_role", true, adminRole.id);

    const { data: createdAuth, error: createAuthError } = await svc.auth.admin.createUser({
      email: adminEmail,
      password: OLD_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Disposable Admin" },
    });
    if (createAuthError || !createdAuth.user?.id) {
      record("create_disposable_admin_auth", false, createAuthError?.message ?? "createUser failed");
      throw new Error("auth user create failed");
    }
    adminUserId = createdAuth.user.id;
    record("create_disposable_admin_auth", true, `${adminUserId} / ${adminEmail}`);

    const { error: profileError } = await svc.from("profiles").upsert({
      id: adminUserId,
      user_id: adminUserId,
      email: adminEmail,
      full_name: "Disposable Admin",
      company_id: companyId,
      is_active: true,
      is_super_admin: false,
    });
    if (profileError) {
      record("upsert_admin_profile", false, profileError.message);
      throw new Error(profileError.message);
    }
    record("upsert_admin_profile", true, "ok");

    const { error: roleAssignError } = await svc.from("user_roles").insert({
      user_id: adminUserId,
      role_id: adminRole.id,
    });
    if (roleAssignError) {
      // Some schemas use replace_user_role RPC
      const { error: rpcError } = await svc.rpc("replace_user_role", {
        p_user_id: adminUserId,
        p_role_id: adminRole.id,
      });
      if (rpcError) {
        record("assign_admin_role", false, roleAssignError.message + " / " + rpcError.message);
        throw new Error(rpcError.message);
      }
    }
    record("assign_admin_role", true, "ok");

    record(
      "contact_email_not_login_identity",
      CONTACT_EMAIL.toLowerCase() !== adminEmail.toLowerCase(),
      `contact=${CONTACT_EMAIL} login=${adminEmail}`,
    );

    // Establish an old session before reset
    const oldSession = await signIn(adminEmail, OLD_PASSWORD);
    record(
      "old_password_authenticates_before_reset",
      !oldSession.error && Boolean(oldSession.data.session?.access_token),
      oldSession.error?.message ?? "session ok",
    );
    const oldAccess = oldSession.data.session?.access_token ?? null;
    const oldRefresh = oldSession.data.session?.refresh_token ?? null;

    // Authorized reset via Edge Function
    const { data: resetData, error: resetError } = await platform.client.functions.invoke(
      "reset-company-admin-password",
      {
        body: {
          companyId,
          adminUserId,
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        },
      },
    );

    const resetOk = !resetError && resetData?.ok === true && resetData?.adminUserId === adminUserId;
    record(
      "super_admin_reset_succeeds",
      resetOk,
      resetError?.message ?? JSON.stringify({
        ok: resetData?.ok,
        adminUserId: resetData?.adminUserId,
        adminEmail: resetData?.adminEmail,
        hasPassword: Boolean(resetData?.password || resetData?.newPassword),
      }),
    );
    record(
      "response_never_includes_password",
      resetOk && !("password" in (resetData ?? {})) && !("newPassword" in (resetData ?? {})),
      "checked response keys",
    );
    record(
      "resolved_admin_matches_login_not_contact",
      resetOk && String(resetData?.adminEmail).toLowerCase() === adminEmail.toLowerCase(),
      `returned=${resetData?.adminEmail}`,
    );

    // Wrong caller: company admin cannot reset (must use NEW password after successful reset)
    const tenantCaller = await signIn(adminEmail, NEW_PASSWORD);
    if (tenantCaller.error) {
      record("tenant_caller_signin_for_authz", false, tenantCaller.error.message);
    } else {
      record("tenant_caller_signin_for_authz", true, "signed in as disposable company admin");
      const { data: denyData, error: denyError } = await tenantCaller.client.functions.invoke(
        "reset-company-admin-password",
        {
          body: {
            companyId,
            adminUserId,
            newPassword: "AnotherPass2026!",
            confirmPassword: "AnotherPass2026!",
          },
        },
      );
      const denied =
        Boolean(denyError) ||
        denyData?.error === "request_denied" ||
        denyData?.error === "unauthorized" ||
        denyData?.ok !== true;
      record("company_admin_cannot_reset", denied, JSON.stringify({ denyError: denyError?.message, denyData }));
    }

    // Cross-company mismatch: manipulate adminUserId
    const { data: mismatchData, error: mismatchError } = await platform.client.functions.invoke(
      "reset-company-admin-password",
      {
        body: {
          companyId,
          adminUserId: "00000000-0000-4000-8000-000000000099",
          newPassword: "MismatchPass2026!",
          confirmPassword: "MismatchPass2026!",
        },
      },
    );
    const mismatchDenied =
      Boolean(mismatchError) ||
      mismatchData?.ok !== true ||
      mismatchData?.error === "request_denied";
    record("stale_admin_user_id_rejected", mismatchDenied, JSON.stringify({ mismatchError: mismatchError?.message, mismatchData }));

    // Old password must fail
    const oldAfter = await signIn(adminEmail, OLD_PASSWORD);
    record(
      "old_password_fails_after_reset",
      Boolean(oldAfter.error),
      oldAfter.error?.message ?? "UNEXPECTED: old password still works",
    );

    // New password must work
    const newAfter = await signIn(adminEmail, NEW_PASSWORD);
    record(
      "new_password_succeeds_after_reset",
      !newAfter.error && Boolean(newAfter.data.session),
      newAfter.error?.message ?? "session ok",
    );

    // Old refresh token must be revoked
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

    // Audit: no password material
    const { data: audits } = await svc
      .from("audit_logs")
      .select("id, entity, action, entity_id, metadata, created_at")
      .eq("entity", "admin_password_reset")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(5);

    const successAudit = (audits ?? []).find((a) => a.metadata?.result === "success");
    const auditBlob = JSON.stringify(audits ?? []);
    const passwordLeak =
      /NewAdminPass2026|OldAdminPass2026|password["']?\s*:/i.test(auditBlob);
    record(
      "audit_success_recorded",
      Boolean(successAudit) && String(successAudit?.entity_id) === adminUserId,
      successAudit ? `id=${successAudit.id}` : "missing success audit",
    );
    record("audit_never_contains_password", !passwordLeak, passwordLeak ? "LEAK" : "clean");

    // Application tables must not store password
    const { data: companyRow } = await svc.from("companies").select("*").eq("id", companyId).single();
    const { data: profileRow } = await svc.from("profiles").select("*").eq("id", adminUserId!).single();
    const appLeak = JSON.stringify({ companyRow, profileRow }).includes(NEW_PASSWORD);
    record("password_not_in_app_tables", !appLeak, appLeak ? "LEAK" : "clean");

    // Roles/company status unchanged
    const { data: roleCheck } = await svc
      .from("user_roles")
      .select("role_id")
      .eq("user_id", adminUserId!)
      .limit(1);
    record(
      "roles_unchanged",
      (roleCheck ?? []).some((r) => r.role_id === adminRole!.id),
      "admin role still assigned",
    );
    record(
      "company_status_unchanged",
      companyRow?.status === "Active" && companyRow?.approval_status === "approved",
      `status=${companyRow?.status} approval=${companyRow?.approval_status}`,
    );
  } catch (error) {
    record("suite_aborted", false, error instanceof Error ? error.message : String(error));
  } finally {
    // Cleanup disposable artifacts (best-effort). Never touch CVP/Nessma.
    try {
      if (adminUserId) {
        await svc.from("user_roles").delete().eq("user_id", adminUserId);
        await svc.from("profiles").delete().eq("id", adminUserId);
        await svc.auth.admin.deleteUser(adminUserId);
      }
      if (companyId) {
        await svc.from("audit_logs").delete().eq("company_id", companyId).eq("entity", "admin_password_reset");
        await svc.from("roles").delete().eq("company_id", companyId);
        await svc.from("companies").delete().eq("id", companyId);
      }
      record("cleanup_disposable", true, `company=${companyId} user=${adminUserId}`);
    } catch (cleanupError) {
      record(
        "cleanup_disposable",
        false,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      );
    }
  }

  const outPath = resolve(root, "scripts/_tmp-reset-admin-password-e2e.out.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        platformEmail,
        companyId,
        adminUserId,
        adminEmail,
        contactEmail: CONTACT_EMAIL,
        checks,
        pass: checks.every((c) => c.ok),
      },
      null,
      2,
    ),
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
