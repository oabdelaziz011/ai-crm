/**
 * Enterprise RBAC milestone validation — real tenant (Al Rahma structural + live E2E tenant).
 * Requires SUPABASE_SERVICE_ROLE_KEY in env for Company Admin live session bootstrap.
 * Run: npx tsx scripts/enterprise-rbac-milestone-validation.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const AL_RAHMA_ID = "cecad301-dbac-48ca-ae1f-7fbf645c85c6";
const VAULTOS_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PLATFORM_EMAIL = "demo-platform@vaultos.local";
const PASSWORD = "DemoVault2026!";

type Result = { id: string; pass: boolean; detail: string };
const results: Result[] = [];

function loadEnv() {
  const env: Record<string, string> = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

function record(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${id} — ${detail}`);
}

async function signIn(url: string, key: string, email: string, password = PASSWORD) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function getProfile(client: SupabaseClient) {
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("No authenticated user");
  const { data, error } = await client
    .from("profiles")
    .select("id, company_id, is_super_admin, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; company_id: string | null; is_super_admin: boolean; email: string };
}

async function bootstrapCompanyAdminSession(
  url: string,
  anonKey: string,
  serviceKey: string,
  platformClient: SupabaseClient,
): Promise<{ adminClient: SupabaseClient; tenantId: string; tenantLabel: string; adminUserId: string }> {
  const { data: created, error: createCompanyError } = await platformClient.rpc("create_company_v1", {
    p_name: `RBAC Milestone ${new Date().toISOString().slice(0, 19)}Z`,
    p_status: "Active",
    p_subscription_plan: "Pro",
    p_subscription_expires_at: null,
    p_logo_url: null,
  });

  if (createCompanyError || !created?.company?.id) {
    throw new Error(createCompanyError?.message ?? "create_company_v1 failed");
  }

  const tenantId = created.company.id as string;
  const tenantLabel = created.company.name as string;

  const adminReader = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roles, error: rolesError } = await adminReader
    .from("roles")
    .select("id, name, role_type, template_key, company_id")
    .eq("company_id", tenantId)
    .eq("role_type", "DEFAULT");

  if (rolesError) throw new Error(rolesError.message);
  const adminRole = (roles ?? []).find((r) => r.template_key === "admin");
  if (!adminRole?.id) {
    throw new Error(`Company Admin DEFAULT role missing on new tenant (count=${roles?.length ?? 0})`);
  }

  const testEmail = `rbacmilestone${Date.now()}@vaultos.local`;
  const tempPassword = `RbM-${Date.now().toString(36)}!Aa1`;

  const { data: createdUser, error: createUserError } = await adminReader.auth.admin.createUser({
    email: testEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: "RBAC Milestone Admin" },
  });

  if (createUserError || !createdUser.user?.id) {
    throw new Error(createUserError?.message ?? "auth.admin.createUser failed");
  }

  const bootstrapUserId = createdUser.user.id;

  const { error: profileError } = await adminReader
    .from("profiles")
    .update({
      company_id: tenantId,
      full_name: "RBAC Milestone Admin",
      is_active: true,
      is_super_admin: false,
    })
    .eq("id", bootstrapUserId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: roleError } = await adminReader.rpc("replace_user_role", {
    p_user_id: bootstrapUserId,
    p_role_id: adminRole.id,
  });
  if (roleError) {
    throw new Error(roleError.message);
  }

  const adminClient = await signIn(url, anonKey, testEmail, tempPassword);
  return { adminClient, tenantId, tenantLabel, adminUserId: bootstrapUserId };
}

async function runCompanyAdminSuite(
  adminClient: SupabaseClient,
  tenantId: string,
  adminUserId: string,
  idPrefix: string,
) {
  const { data: defaultRoles, error: defaultRolesError } = await adminClient
    .from("roles")
    .select("id, name, role_type, template_key, company_id")
    .eq("company_id", tenantId)
    .eq("role_type", "DEFAULT");

  if (defaultRolesError) {
    record(`${idPrefix}.1.default_roles`, false, defaultRolesError.message);
  } else {
    const keys = new Set((defaultRoles ?? []).map((r) => r.template_key));
    record(
      `${idPrefix}.1.default_roles`,
      keys.has("admin") && keys.has("manager") && keys.has("employee") && (defaultRoles?.length ?? 0) === 3,
      `count=${defaultRoles?.length ?? 0}, templates=${Array.from(keys).join(",")}`,
    );
  }

  const { data: visibleRoles, error: rolesError } = await adminClient
    .from("roles")
    .select("id, company_id, role_type, name");

  if (rolesError) {
    record(`${idPrefix}.2.tenant_roles_only`, false, rolesError.message);
  } else {
    const foreign = (visibleRoles ?? []).filter((r) => r.company_id !== tenantId);
    const platformGlobal = (visibleRoles ?? []).filter((r) => r.company_id === null);
    record(
      `${idPrefix}.2.tenant_roles_only`,
      foreign.length === 0 && platformGlobal.length === 0,
      `visible=${visibleRoles?.length ?? 0}, foreign=${foreign.length}, platform=${platformGlobal.length}`,
    );
  }

  const { data: visibleProfiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, company_id, email");

  if (profilesError) {
    record(`${idPrefix}.3.tenant_users_only`, false, profilesError.message);
  } else {
    const foreign = (visibleProfiles ?? []).filter((p) => p.company_id !== tenantId);
    record(
      `${idPrefix}.3.tenant_users_only`,
      foreign.length === 0 && (visibleProfiles?.length ?? 0) >= 1,
      `visible=${visibleProfiles?.length ?? 0}, foreign=${foreign.length}`,
    );
  }

  const customRoleName = `Milestone Custom ${Date.now()}`;
  let customRoleId: string | null = null;

  const { data: createdRole, error: createError } = await adminClient
    .from("roles")
    .insert({ name: customRoleName, description: "RBAC milestone validation", company_id: tenantId })
    .select("id, role_type, company_id")
    .single();

  if (createError || !createdRole?.id) {
    record(`${idPrefix}.4.create_custom_role`, false, createError?.message ?? "No role returned");
  } else {
    customRoleId = createdRole.id;
    record(
      `${idPrefix}.4.create_custom_role`,
      createdRole.role_type === "CUSTOM" && createdRole.company_id === tenantId,
      `id=${createdRole.id}`,
    );
  }

  if (customRoleId) {
    const { data: permRow } = await adminClient
      .from("permissions")
      .select("id, code")
      .eq("code", "customers.view")
      .maybeSingle();

    if (!permRow?.id) {
      record(`${idPrefix}.5.edit_custom_permissions`, false, "customers.view permission not found");
    } else {
      const { error: insertPermError } = await adminClient
        .from("role_permissions")
        .insert({ role_id: customRoleId, permission_id: permRow.id });

      const { data: verifyPerms } = await adminClient
        .from("role_permissions")
        .select("permissions(code)")
        .eq("role_id", customRoleId);

      const codes = (verifyPerms ?? [])
        .map((row) => (row.permissions as { code?: string } | null)?.code)
        .filter(Boolean);

      record(
        `${idPrefix}.5.edit_custom_permissions`,
        !insertPermError && codes.includes("customers.view"),
        insertPermError?.message ?? `permissions=${codes.join(",")}`,
      );
    }
  } else {
    record(`${idPrefix}.5.edit_custom_permissions`, false, "Skipped — custom role not created");
  }

  const defaultAdminRole = (defaultRoles ?? []).find((r) => r.template_key === "admin");
  if (!defaultAdminRole?.id) {
    record(`${idPrefix}.6.protect_default_roles`, false, "No DEFAULT admin role found");
  } else {
    const { error: deleteDefaultError } = await adminClient
      .from("roles")
      .delete()
      .eq("id", defaultAdminRole.id);

    const { data: stillThere } = await adminClient
      .from("roles")
      .select("id")
      .eq("id", defaultAdminRole.id)
      .maybeSingle();

    record(
      `${idPrefix}.6.protect_default_roles`,
      Boolean(stillThere?.id),
      stillThere?.id
        ? deleteDefaultError?.message ?? "DEFAULT role delete blocked (role still present)"
        : deleteDefaultError?.message ?? "DEFAULT role was deleted",
    );
  }

  const managerRole = (defaultRoles ?? []).find((r) => r.template_key === "manager");
  if (!managerRole?.id) {
    record(`${idPrefix}.7.last_company_admin`, false, "No Manager DEFAULT role for replacement test");
  } else {
    const { error: replaceError } = await adminClient.rpc("replace_user_role", {
      p_user_id: adminUserId,
      p_role_id: managerRole.id,
    });

    const { data: afterRole } = await adminClient
      .from("user_roles")
      .select("role_id, roles(template_key)")
      .eq("user_id", adminUserId)
      .maybeSingle();

    const stillAdmin =
      (afterRole?.roles as { template_key?: string } | null)?.template_key === "admin";

    record(
      `${idPrefix}.7.last_company_admin`,
      Boolean(replaceError) && stillAdmin,
      replaceError?.message ?? "Last admin demotion unexpectedly succeeded",
    );
  }

  if (customRoleId) {
    await adminClient.from("role_permissions").delete().eq("role_id", customRoleId);
    await adminClient.from("roles").delete().eq("id", customRoleId);
  }
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.error("Missing Supabase URL / publishable key");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY (required to bootstrap Company Admin live session)");
    process.exit(1);
  }

  console.log("=== Enterprise RBAC Milestone Validation ===\n");

  const serviceReader = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rahmaDefaults, error: rahmaError } = await serviceReader
    .from("roles")
    .select("template_key, name, role_type")
    .eq("company_id", AL_RAHMA_ID)
    .eq("role_type", "DEFAULT");

  const { data: rahmaCompany } = await serviceReader
    .from("companies")
    .select("name, tenant_provisioning_status, provisioning_error, provisioning_attempt_count, provisioned_at")
    .eq("id", AL_RAHMA_ID)
    .maybeSingle();

  const rahmaKeys = new Set((rahmaDefaults ?? []).map((r) => r.template_key));
  record(
    "al_rahma.1.default_roles",
    !rahmaError &&
      rahmaKeys.has("admin") &&
      rahmaKeys.has("manager") &&
      rahmaKeys.has("employee") &&
      (rahmaDefaults?.length ?? 0) === 3,
    rahmaError?.message ??
      `${rahmaCompany?.name ?? "Al Rahma"} status=${rahmaCompany?.tenant_provisioning_status}, roles=${(rahmaDefaults ?? []).map((r) => r.name).join(", ")}`,
  );

  const platformClient = await signIn(url, anonKey, PLATFORM_EMAIL);
  record("0.setup.platform", true, PLATFORM_EMAIL);

  const { adminClient, tenantId, tenantLabel, adminUserId } = await bootstrapCompanyAdminSession(
    url,
    anonKey,
    serviceKey,
    platformClient,
  );
  record("0.setup.tenant_admin", true, `Live session on new tenant "${tenantLabel}" (${tenantId})`);

  await runCompanyAdminSuite(adminClient, tenantId, adminUserId, "live");
  await adminClient.auth.signOut();

  const platformProfile = await getProfile(platformClient);
  record(
    "8.platform_super_admin.session",
    platformProfile.is_super_admin === true,
    `is_super_admin=${platformProfile.is_super_admin}`,
  );

  const { data: allRoles } = await platformClient.from("roles").select("id, company_id");
  const { data: allProfiles } = await platformClient.from("profiles").select("id, company_id");
  const roleCompanies = new Set((allRoles ?? []).map((r) => r.company_id ?? "NULL"));
  const profileCompanies = new Set((allProfiles ?? []).map((p) => p.company_id ?? "NULL"));

  record(
    "8.platform_super_admin.broad_read",
    (allRoles?.length ?? 0) >= 3 && (allProfiles?.length ?? 0) >= 2 && roleCompanies.size >= 2,
    `roles=${allRoles?.length ?? 0} buckets=${roleCompanies.size}, profiles=${allProfiles?.length ?? 0} companies=${profileCompanies.size}`,
  );

  const { data: rahmaRolesFromPlatform } = await platformClient
    .from("roles")
    .select("id")
    .eq("company_id", AL_RAHMA_ID);

  record(
    "8.platform_super_admin.al_rahma_visible",
    (rahmaRolesFromPlatform?.length ?? 0) >= 3,
    `Al Rahma roles visible to platform=${rahmaRolesFromPlatform?.length ?? 0}`,
  );

  const { data: vaultosRolesFromPlatform } = await platformClient
    .from("roles")
    .select("id")
    .eq("company_id", VAULTOS_ID);

  record(
    "8.platform_super_admin.vaultos_visible",
    (vaultosRolesFromPlatform?.length ?? 0) >= 1,
    `VaultOS roles visible to platform=${vaultosRolesFromPlatform?.length ?? 0}`,
  );

  await platformClient.auth.signOut();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length > 0) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
    process.exit(1);
  }

  console.log("\nEnterprise RBAC milestone: COMPLETE");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
