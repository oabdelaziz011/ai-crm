/**
 * E2E: company role provisioning + cross-tenant assignment guards (live Supabase).
 * Run: tsx scripts/company-provisioning-e2e.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
const PASSWORD = "DemoVault2026!";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
}

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !SERVICE_KEY) {
    console.error("Missing Supabase env (URL, publishable key, service role key)");
    process.exit(1);
  }

  const superClient = await signIn("super.admin@vaultos.local");
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const companyName = `E2E Provision ${Date.now()}`;
  const { data: createdCompany, error: createError } = await superClient
    .from("companies")
    .insert({
      name: companyName,
      status: "Trial",
      subscription_plan: "Basic",
    })
    .select("id")
    .single();

  if (createError || !createdCompany?.id) {
    record("New company automatically receives roles", false, createError?.message ?? "insert failed");
  } else {
    const { data: roles, error: rolesError } = await adminClient
      .from("roles")
      .select("id, name, company_id, is_system")
      .eq("company_id", createdCompany.id)
      .order("name");

    const roleNames = (roles ?? []).map((role) => role.name).sort();
    const expected = ["Admin", "Employee", "Manager"];
    const ok =
      !rolesError &&
      roleNames.length === 3 &&
      expected.every((name) => roleNames.includes(name)) &&
      (roles ?? []).every((role) => role.is_system === false);

    record(
      "New company automatically receives roles",
      ok,
      rolesError?.message ?? `roles=${roleNames.join(", ")}`,
    );

    await adminClient.from("companies").delete().eq("id", createdCompany.id);
  }

  const BETA_COMPANY = "d0000010-0001-4001-8001-000000000002";
  const GAMMA_COMPANY = "d0000010-0001-4001-8001-000000000003";
  const BETA_ROLE = "d0000030-0001-4001-8001-000000000004";
  const GAMMA_ROLE = "d0000030-0001-4001-8001-000000000005";

  const { data: gammaUsers } = await adminClient
    .from("profiles")
    .select("id")
    .eq("company_id", GAMMA_COMPANY)
    .limit(1);
  const gammaUserId = gammaUsers?.[0]?.id;

  if (gammaUserId) {
    const betaAdmin = await signIn("beta.admin@vaultos.local");
    const { error: crossTenantError } = await betaAdmin.from("user_roles").insert({
      user_id: gammaUserId,
      role_id: BETA_ROLE,
    });
    record(
      "Company A cannot assign Company B role",
      Boolean(crossTenantError),
      crossTenantError?.message ?? "unexpected success",
    );
  } else {
    record("Company A cannot assign Company B role", false, "gamma user not found");
  }

  const { data: repairResult, error: repairError } = await adminClient.rpc(
    "repair_companies_missing_roles",
  );
  record(
    "Existing companies repaired (RPC callable)",
    !repairError,
    repairError?.message ?? JSON.stringify(repairResult),
  );

  const failed = results.filter((entry) => !entry.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };

  const outDir = resolve(root, "artifacts/reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "company-provisioning-e2e.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(`${report.passed}/${report.total} passed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
