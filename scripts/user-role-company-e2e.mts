/**
 * Live E2E: cross-tenant user_roles assignment must be rejected by RLS (migration 117).
 * Run: tsx scripts/user-role-company-e2e.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const BETA_COMPANY = "d0000010-0001-4001-8001-000000000002";
const GAMMA_COMPANY = "d0000010-0001-4001-8001-000000000003";
const BETA_EMPLOYEE_ROLE = "d0000030-0001-4001-8001-000000000004";
const GAMMA_ADMIN_ROLE = "d0000030-0001-4001-8001-000000000005";

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

async function findGammaUser(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, company_id")
    .eq("company_id", GAMMA_COMPANY)
    .eq("is_super_admin", false)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
    process.exit(1);
  }

  const superClient = await signIn("super.admin@vaultos.local");
  const betaAdminClient = await signIn("beta.admin@vaultos.local");
  const gammaUser = await findGammaUser(superClient);

  if (!gammaUser?.id) {
    record("Setup — gamma tenant user exists", false, "No gamma company user found");
  } else {
    record("Setup — gamma tenant user exists", true, gammaUser.email ?? gammaUser.id);
  }

  if (gammaUser?.id) {
    const { error: betaCrossAssign } = await betaAdminClient.from("user_roles").insert({
      user_id: gammaUser.id,
      role_id: BETA_EMPLOYEE_ROLE,
    });
    record(
      "Company A admin cannot assign Company A role to Company B user",
      Boolean(betaCrossAssign),
      betaCrossAssign?.message ?? "insert unexpectedly succeeded",
    );

    const { error: superCrossAssign } = await superClient.from("user_roles").insert({
      user_id: gammaUser.id,
      role_id: BETA_EMPLOYEE_ROLE,
    });
    record(
      "Super Admin cannot assign Company A role to Company B user",
      Boolean(superCrossAssign),
      superCrossAssign?.message ?? "insert unexpectedly succeeded",
    );

    const { data: betaUsers } = await superClient
      .from("profiles")
      .select("id")
      .eq("company_id", BETA_COMPANY)
      .eq("is_super_admin", false)
      .limit(1);
    const betaUserId = betaUsers?.[0]?.id;

    if (betaUserId) {
      const { error: superWrongTenant } = await superClient.from("user_roles").insert({
        user_id: betaUserId,
        role_id: GAMMA_ADMIN_ROLE,
      });
      record(
        "Super Admin cannot assign Company B role to Company A user",
        Boolean(superWrongTenant),
        superWrongTenant?.message ?? "insert unexpectedly succeeded",
      );
    } else {
      record("Super Admin cannot assign Company B role to Company A user", false, "No beta user found");
    }
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };

  const outDir = resolve(root, "artifacts/reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "user-role-company-e2e.json");
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
