/**
 * Validates get_assignable_roles RPC for Users page role dropdown.
 * Run after applying migration 121: tsx scripts/get-assignable-roles-probe.mts
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
const TENANT_WITH_ROLES = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const OTHER_TENANT = "d0000010-0001-4001-8001-000000000002";

async function signIn(email: string) {
  const client = createClient(url!, key!, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`${email}: ${signIn.error.message}`);
  return client;
}

async function probeActor(email: string) {
  const client = await signIn(email);
  const { data: profile } = await client
    .from("profiles")
    .select("company_id,is_super_admin")
    .eq("id", (await client.auth.getUser()).data.user!.id)
    .maybeSingle();

  const ownCompanyId = profile?.company_id ?? OTHER_TENANT;
  const targetCompany = profile?.is_super_admin ? TENANT_WITH_ROLES : ownCompanyId;
  const foreignCompany =
    targetCompany === TENANT_WITH_ROLES ? OTHER_TENANT : TENANT_WITH_ROLES;

  const { data: usersEdit } = await client.rpc("user_has_permission", { p_code: "users.edit" });
  const { data: rolesView } = await client.rpc("user_has_permission", { p_code: "roles.view" });

  const ownRpc = await client.rpc("get_assignable_roles", { p_company_id: targetCompany });
  const foreignRpc = await client.rpc("get_assignable_roles", { p_company_id: foreignCompany });

  const directOwn = await client.from("roles").select("id, name").eq("company_id", targetCompany);

  return {
    email,
    isSuperAdmin: profile?.is_super_admin === true,
    usersEdit,
    rolesView,
    targetCompany,
    foreignCompany,
    ownRpc: {
      error: ownRpc.error?.message ?? null,
      count: Array.isArray(ownRpc.data) ? ownRpc.data.length : 0,
      names: Array.isArray(ownRpc.data) ? ownRpc.data.map((r: { name: string | null }) => r.name) : [],
    },
    foreignRpc: {
      error: foreignRpc.error?.message ?? null,
      count: Array.isArray(foreignRpc.data) ? foreignRpc.data.length : 0,
    },
    directOwnSelectCount: directOwn.data?.length ?? 0,
  };
}

function evaluate(results: Awaited<ReturnType<typeof probeActor>>[]) {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  const platform = results.find((r) => r.isSuperAdmin);
  const companyAdmin = results.find((r) => !r.isSuperAdmin && r.usersEdit);

  if (platform) {
    checks.push({
      name: "Super admin can read assignable roles for target tenant",
      pass: platform.ownRpc.error === null && platform.ownRpc.count > 0,
      detail: `count=${platform.ownRpc.count}, error=${platform.ownRpc.error}`,
    });
    checks.push({
      name: "Super admin foreign tenant RPC allowed",
      pass: platform.foreignRpc.error === null,
      detail: platform.foreignRpc.error ?? `count=${platform.foreignRpc.count}`,
    });
  }

  if (companyAdmin) {
    checks.push({
      name: "Company admin own-tenant RPC returns roles without roles.view",
      pass: companyAdmin.ownRpc.error === null && companyAdmin.ownRpc.count > 0,
      detail: `rolesView=${companyAdmin.rolesView}, rpcCount=${companyAdmin.ownRpc.count}`,
    });
    checks.push({
      name: "Company admin blocked from foreign tenant",
      pass:
        companyAdmin.foreignRpc.error !== null &&
        companyAdmin.foreignRpc.error.includes("Cross tenant access denied"),
      detail: companyAdmin.foreignRpc.error ?? `unexpected count=${companyAdmin.foreignRpc.count}`,
    });
    checks.push({
      name: "Direct roles SELECT may be empty while RPC works (RLS preserved)",
      pass: companyAdmin.ownRpc.count > 0,
      detail: `direct=${companyAdmin.directOwnSelectCount}, rpc=${companyAdmin.ownRpc.count}`,
    });
  }

  return checks;
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  const results = await Promise.all([
    probeActor("demo-beta-admin@vaultos.local"),
    probeActor("demo-platform@vaultos.local"),
  ]);

  console.log(JSON.stringify({ results }, null, 2));

  if (results.some((r) => r.ownRpc.error?.includes("Could not find the function"))) {
    console.error("\nFAIL: Apply migration 121_get_assignable_roles_rpc.sql first.");
    process.exit(1);
  }

  const checks = evaluate(results);
  console.log("\nValidation checks:");
  let failed = 0;
  for (const check of checks) {
    console.log(`[${check.pass ? "PASS" : "FAIL"}] ${check.name} — ${check.detail}`);
    if (!check.pass) failed += 1;
  }

  const unit = await import("node:child_process");
  unit.execSync("npx tsx scripts/user-role-company-validation.test.mts", {
    cwd: root,
    stdio: "inherit",
  });

  console.log(`\nFinal: ${failed === 0 ? "PASS" : "FAIL"} (${failed} check(s) failed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
