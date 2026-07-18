/**
 * E2E security tests for provision-user Edge Function (live deployment).
 * Run: tsx scripts/provision-user-security-e2e.mts
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
const BETA_ADMIN_ROLE = "d0000030-0001-4001-8001-000000000002";
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
const REDIRECT = "http://localhost:5173/auth/callback?next=%2Freset-password";

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
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? "";
}

async function invokeProvision(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    email: `security-provision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@vaultos.local`,
    fullName: "Security Test User",
    companyId: BETA_COMPANY,
    roleId: BETA_EMPLOYEE_ROLE,
    isActive: true,
    redirectTo: REDIRECT,
    ...overrides,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env");
    process.exit(2);
  }

  console.log("provision-user Security E2E\n");

  const employeeToken = await signIn("demo-employee@vaultos.local");
  const betaAdminToken = await signIn("demo-beta-admin@vaultos.local");
  const platformToken = await signIn("demo-platform@vaultos.local");

  {
    const { status, body } = await invokeProvision(employeeToken, basePayload());
    record(
      "missing users.edit permission",
      status === 403 && body.error === "Forbidden" && !body.reason,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const { status, body } = await invokeProvision(
      betaAdminToken,
      basePayload({ companyId: GAMMA_COMPANY }),
    );
    record(
      "fake companyId mismatch",
      status === 403 && body.error === "Forbidden" && !body.reason,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const { status, body } = await invokeProvision(
      betaAdminToken,
      basePayload({ companyId: BETA_COMPANY, roleId: GAMMA_ADMIN_ROLE }),
    );
    record(
      "role from another company",
      status === 403 && body.error === "Forbidden" && !body.reason,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const { status, body } = await invokeProvision(
      betaAdminToken,
      basePayload({
        companyId: GAMMA_COMPANY,
        roleId: BETA_ADMIN_ROLE,
      }),
    );
    record(
      "system role assignment attempt (cross-tenant)",
      status === 403 && body.error === "Forbidden" && !body.reason,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const { status, body } = await invokeProvision(
      betaAdminToken,
      basePayload({
        email: "demo-gamma-admin@vaultos.local",
        companyId: BETA_COMPANY,
        roleId: BETA_EMPLOYEE_ROLE,
      }),
    );
    record(
      "target user from another company",
      status === 403 && body.error === "Forbidden" && !body.reason,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const email = `security-valid-${Date.now()}@vaultos.local`;
    const { status, body } = await invokeProvision(
      betaAdminToken,
      basePayload({
        email,
        companyId: BETA_COMPANY,
        roleId: BETA_EMPLOYEE_ROLE,
      }),
    );
    record(
      "valid same-company role",
      status === 200 && body.ok === true,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }
  await sleep(1200);

  {
    const email = `security-super-${Date.now()}@vaultos.local`;
    const { status, body } = await invokeProvision(
      platformToken,
      basePayload({
        email,
        companyId: GAMMA_COMPANY,
        roleId: GAMMA_ADMIN_ROLE,
      }),
    );
    record(
      "super admin path",
      status === 200 && body.ok === true,
      `status=${status} body=${JSON.stringify(body)}`,
    );
  }

  const failed = results.filter((r) => !r.ok).length;
  const report = {
    date: new Date().toISOString(),
    summary: `${results.length - failed}/${results.length} passed`,
    results,
  };

  const outDir = resolve(root, "docs/operations");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "provision-user-security-validation-2026-07-18.md"),
    `# provision-user Security Validation\n\n**Date:** ${report.date}\n**Summary:** ${report.summary}\n\n| Test | Result | Detail |\n|---|---|---|\n${results.map((r) => `| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "\\|")} |`).join("\n")}\n`,
    "utf8",
  );

  console.log(`\n=== Summary: ${report.summary} ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
