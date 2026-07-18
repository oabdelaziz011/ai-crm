/**
 * Deployment readiness probe for migrations 123 + 124.
 * Run: tsx scripts/migration-123-124-readiness-probe.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
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

type Step = { step: string; ok: boolean; detail: string };
const steps: Step[] = [];

function record(step: string, ok: boolean, detail: string) {
  steps.push({ step, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${step} — ${detail}`);
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    console.error("Missing Supabase URL / anon key");
    process.exit(1);
  }

  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const serviceClient = service ? createClient(url, service, { auth: { persistSession: false } }) : null;

  const { error: anonExecuteError } = await anonClient.rpc("execute_tenant_provisioning", {
    p_company_id: "00000000-0000-0000-0000-000000000001",
  });
  record(
    "P1: anonymous cannot execute_tenant_provisioning",
    Boolean(anonExecuteError),
    anonExecuteError?.message ?? "unexpected success",
  );

  const tenantEmail = env.READINESS_TENANT_EMAIL;
  const tenantPassword = env.READINESS_TENANT_PASSWORD;
  if (tenantEmail && tenantPassword) {
    const { error: signInError } = await anonClient.auth.signInWithPassword({
      email: tenantEmail,
      password: tenantPassword,
    });
    if (signInError) {
      record("P1: tenant sign-in for RPC probe", false, signInError.message);
    } else {
      const { error: tenantExecuteError } = await anonClient.rpc("execute_tenant_provisioning", {
        p_company_id: "00000000-0000-0000-0000-000000000001",
      });
      record(
        "P1: non-super-admin tenant cannot execute_tenant_provisioning",
        Boolean(tenantExecuteError),
        tenantExecuteError?.message ?? "unexpected success",
      );
    }
  } else {
    record("P1: tenant RPC probe", true, "skipped (set READINESS_TENANT_EMAIL/PASSWORD)");
  }

  if (serviceClient) {
    const { data: auditRows, error: auditError } = await serviceClient
      .from("tenant_admin_role_audit")
      .select("company_id, issue_code, details, resolved_at")
      .eq("issue_code", "duplicate_admin_semantics");

    record(
      "P4: duplicate admin audit table readable",
      !auditError,
      auditError?.message ?? `${auditRows?.length ?? 0} flagged tenant(s)`,
    );
  } else {
    record("P4: duplicate admin audit table", true, "skipped (no service role key)");
  }

  const failed = steps.filter((step) => !step.ok);
  console.log(`\nReadiness probe: ${steps.length - failed.length}/${steps.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
