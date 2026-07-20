/**
 * Post-126 tenant isolation probe.
 * Run: npx tsx scripts/tenant-isolation-probe.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
const DEMO_BETA_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

type ProbeResult = {
  actor: string;
  isSuperAdmin: boolean;
  companyId: string | null;
  roleCount: number;
  roleCompanies: string[];
  platformRoleCount: number;
  profileCount: number;
  profileCompanies: string[];
};

async function probeActor(email: string): Promise<ProbeResult> {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) {
    throw new Error(`${email}: sign-in failed — ${signInError.message}`);
  }

  const userId = (await client.auth.getUser()).data.user?.id ?? "";

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("company_id, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`${email}: profile load failed — ${profileError.message}`);
  }

  const { data: roles, error: rolesError } = await client
    .from("roles")
    .select("id, company_id, name, role_type");

  if (rolesError) {
    throw new Error(`${email}: roles query failed — ${rolesError.message}`);
  }

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, company_id");

  if (profilesError) {
    throw new Error(`${email}: profiles query failed — ${profilesError.message}`);
  }

  await client.auth.signOut();

  return {
    actor: email,
    isSuperAdmin: profile?.is_super_admin === true,
    companyId: (profile?.company_id as string | null) ?? null,
    roleCount: roles?.length ?? 0,
    roleCompanies: Array.from(new Set((roles ?? []).map((row) => row.company_id ?? "NULL"))),
    platformRoleCount: (roles ?? []).filter((row) => row.company_id === null).length,
    profileCount: profiles?.length ?? 0,
    profileCompanies: Array.from(new Set((profiles ?? []).map((row) => row.company_id ?? "NULL"))),
  };
}

function assertTenantLocalRoles(result: ProbeResult, expectedCompanyId: string) {
  const foreignRoles = result.roleCompanies.filter(
    (companyId) => companyId !== expectedCompanyId && companyId !== "NULL",
  );
  if (foreignRoles.length > 0) {
    throw new Error(
      `[FAIL] ${result.actor} saw foreign tenant roles: ${foreignRoles.join(", ")}`,
    );
  }
  if (result.platformRoleCount > 0) {
    throw new Error(
      `[FAIL] ${result.actor} saw ${result.platformRoleCount} platform role(s) (company_id IS NULL)`,
    );
  }
  const foreignProfiles = result.profileCompanies.filter(
    (companyId) => companyId !== expectedCompanyId && companyId !== "NULL",
  );
  if (foreignProfiles.length > 0) {
    throw new Error(
      `[FAIL] ${result.actor} saw foreign tenant profiles: ${foreignProfiles.join(", ")}`,
    );
  }
  console.log(
    `[PASS] ${result.actor}: roles=${result.roleCount} (tenant-local), platform roles=0, profiles=${result.profileCount} (tenant-local)`,
  );
}

function assertSuperAdminBroadAccess(result: ProbeResult) {
  if (result.roleCount < 5) {
    throw new Error(`[FAIL] ${result.actor} expected broad role access, got ${result.roleCount}`);
  }
  if (result.platformRoleCount < 1) {
    throw new Error(`[FAIL] ${result.actor} expected platform role visibility, got 0`);
  }
  if (result.profileCount < 5) {
    throw new Error(
      `[FAIL] ${result.actor} expected cross-tenant profiles, got ${result.profileCount}`,
    );
  }
  if (result.profileCompanies.length < 2) {
    throw new Error(
      `[FAIL] ${result.actor} expected multiple profile company buckets, got ${result.profileCompanies.join(", ")}`,
    );
  }
  console.log(
    `[PASS] ${result.actor}: roles=${result.roleCount} (${result.roleCompanies.length} buckets, platform=${result.platformRoleCount}), profiles=${result.profileCount} (${result.profileCompanies.length} companies)`,
  );
}

console.log("=== Post-126 tenant isolation probe ===\n");

const betaAdmin = await probeActor("demo-beta-admin@vaultos.local");
assertTenantLocalRoles(betaAdmin, DEMO_BETA_COMPANY_ID);

const platform = await probeActor("demo-platform@vaultos.local");
assertSuperAdminBroadAccess(platform);

console.log("\nTenant isolation probe: ALL PASS");
