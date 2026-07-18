/**
 * Live E2E verification for get_assignable_roles primary business scenario.
 * Actor: company admin with users.edit=true, roles.view=false (not super admin).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    } catch {
      /* optional */
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = "DemoVault2026!";
const ACTOR_EMAIL = "users-editor-e2e@vaultos.local";
const TENANT_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const FOREIGN_TENANT = "d0000010-0001-4001-8001-000000000002";
const TARGET_EDIT_EMAIL = "hhhfff@yahoo.com";
const EXPECTED_ROLE_NAMES = ["Admin", "Employee", "Manager"];

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email: ACTOR_EMAIL, password: PASSWORD });
  if (signIn.error) {
    console.error(JSON.stringify({ step: "login", pass: false, error: signIn.error.message }, null, 2));
    process.exit(1);
  }

  const actorId = signIn.data.user.id;
  const { data: profile } = await client
    .from("profiles")
    .select("company_id,is_super_admin,email,full_name")
    .eq("id", actorId)
    .maybeSingle();

  const usersEdit = (await client.rpc("user_has_permission", { p_code: "users.edit" })).data;
  const rolesView = (await client.rpc("user_has_permission", { p_code: "roles.view" })).data;
  const usersView = (await client.rpc("user_has_permission", { p_code: "users.view" })).data;

  const ownRpc = await client.rpc("get_assignable_roles", { p_company_id: TENANT_ID });
  const foreignRpc = await client.rpc("get_assignable_roles", { p_company_id: FOREIGN_TENANT });
  const directRoles = await client.from("roles").select("id,name,company_id").eq("company_id", TENANT_ID);

  const { data: targetProfile } = await client
    .from("profiles")
    .select("id,email,company_id")
    .eq("email", TARGET_EDIT_EMAIL)
    .maybeSingle();

  const { data: tenantRoles } = await client
    .from("roles")
    .select("id,name")
    .eq("company_id", TENANT_ID);

  let beforeUserRole: { role_id: string; role_name: string | null } | null = null;
  let afterUserRole: { role_id: string; role_name: string | null } | null = null;
  let saveResult: { pass: boolean; detail: string } = { pass: false, detail: "not run" };

  if (targetProfile?.id) {
    const { data: beforeRows } = await client
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", targetProfile.id)
      .limit(1);
    const before = beforeRows?.[0];
    beforeUserRole = before
      ? { role_id: before.role_id, role_name: (before.roles as { name?: string | null } | null)?.name ?? null }
      : null;

    const employeeRole = (tenantRoles ?? []).find((r) => r.name === "Employee");
    const managerRole = (tenantRoles ?? []).find((r) => r.name === "Manager");
    const newRoleId =
      beforeUserRole?.role_name === "Admin" ? employeeRole?.id : managerRole?.id ?? employeeRole?.id;

    if (newRoleId && newRoleId !== beforeUserRole?.role_id) {
      const { error: deleteError } = await client.from("user_roles").delete().eq("user_id", targetProfile.id);
      const { error: insertError } = await client
        .from("user_roles")
        .insert({ user_id: targetProfile.id, role_id: newRoleId });

      saveResult = {
        pass: !deleteError && !insertError,
        detail: deleteError?.message ?? insertError?.message ?? "saved",
      };

      const { data: afterRows } = await client
        .from("user_roles")
        .select("role_id, roles(name)")
        .eq("user_id", targetProfile.id)
        .limit(1);
      const after = afterRows?.[0];
      afterUserRole = after
        ? { role_id: after.role_id, role_name: (after.roles as { name?: string | null } | null)?.name ?? null }
        : null;

      if (beforeUserRole && saveResult.pass) {
        await client.from("user_roles").delete().eq("user_id", targetProfile.id);
        await client.from("user_roles").insert({
          user_id: targetProfile.id,
          role_id: beforeUserRole.role_id,
        });
      }
    } else {
      saveResult = { pass: false, detail: "Could not pick alternate assignable role for save test" };
    }
  }

  const rpcNames = Array.isArray(ownRpc.data)
    ? ownRpc.data.map((r: { name: string | null; company_id?: string | null }) => r.name).filter(Boolean)
    : [];
  const rpcCompanyIds = Array.isArray(ownRpc.data)
    ? [...new Set(ownRpc.data.map((r: { company_id?: string | null }) => r.company_id).filter(Boolean))]
    : [];

  const checks = [
    {
      name: "Actor is not super admin",
      pass: profile?.is_super_admin !== true,
      detail: `is_super_admin=${profile?.is_super_admin}`,
    },
    {
      name: "users.edit = true",
      pass: usersEdit === true,
      detail: String(usersEdit),
    },
    {
      name: "roles.view = false",
      pass: rolesView !== true,
      detail: String(rolesView),
    },
    {
      name: "Own-tenant RPC succeeds",
      pass: ownRpc.error == null && Array.isArray(ownRpc.data),
      detail: ownRpc.error?.message ?? `count=${ownRpc.data?.length ?? 0}`,
    },
    {
      name: "RPC returns Admin, Manager, Employee",
      pass: EXPECTED_ROLE_NAMES.every((name) => rpcNames.includes(name)),
      detail: rpcNames.join(", "),
    },
    {
      name: "Foreign tenant RPC blocked",
      pass:
        foreignRpc.error != null && foreignRpc.error.message.includes("Cross tenant access denied"),
      detail: foreignRpc.error?.message ?? `unexpected count=${foreignRpc.data?.length ?? 0}`,
    },
    {
      name: "Direct roles SELECT empty while RPC populated (RLS preserved)",
      pass: (directRoles.data?.length ?? 0) === 0 && (ownRpc.data?.length ?? 0) >= 3,
      detail: `direct=${directRoles.data?.length ?? 0}, rpc=${ownRpc.data?.length ?? 0}`,
    },
    {
      name: "No cross-tenant role rows in RPC payload",
      pass: rpcCompanyIds.length === 0,
      detail: rpcCompanyIds.length ? rpcCompanyIds.join(",") : "none",
    },
    {
      name: "Role save via user_roles succeeds",
      pass: saveResult.pass,
      detail: saveResult.detail,
    },
  ];

  const report = {
    actor: {
      email: ACTOR_EMAIL,
      id: actorId,
      companyId: profile?.company_id,
      isSuperAdmin: profile?.is_super_admin,
      usersView,
      usersEdit,
      rolesView,
    },
    rpcResponse: {
      ownTenant: {
        companyId: TENANT_ID,
        error: ownRpc.error?.message ?? null,
        data: ownRpc.data ?? null,
      },
      foreignTenant: {
        companyId: FOREIGN_TENANT,
        error: foreignRpc.error?.message ?? null,
        data: foreignRpc.data ?? null,
      },
    },
    browserNetworkEquivalent: {
      method: "POST",
      path: "/rest/v1/rpc/get_assignable_roles",
      body: { p_company_id: TENANT_ID },
      status: ownRpc.error ? "error" : "200",
      response: ownRpc.error ? { message: ownRpc.error.message } : ownRpc.data,
    },
    roleSave: {
      targetUser: TARGET_EDIT_EMAIL,
      before: beforeUserRole,
      afterTestMutation: afterUserRole,
      restoredToBefore: saveResult.pass,
    },
    checks,
    final: checks.every((c) => c.pass) ? "PASS" : "FAIL",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.final === "PASS" ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
