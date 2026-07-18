/**
 * Live Supabase billing health probe.
 * Run: npm run billing-health-probe
 */
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILLING_HEALTH_ISSUE_LABELS,
  runBillingHealthCheck,
} from "../src/lib/billing/billing-health";
import { loadSupabaseEnv, resolveSupabaseConfig } from "../../../scripts/lib/supabase-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = loadSupabaseEnv(projectRoot);
const config = resolveSupabaseConfig(env);

console.log("\nBilling Health Probe\n");

if (!config) {
  console.error("  ✗ Supabase credentials missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)\n");
  process.exit(1);
}

const client = createClient(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const { error: authError } = await client.auth.signInWithPassword({
    email: "demo-platform@vaultos.local",
    password: "DemoVault2026!",
  });
  if (authError) {
    console.error(`  ✗ Platform auth — ${authError.message}\n`);
    process.exit(1);
  }

  const result = await runBillingHealthCheck(client);

  if (result.healthy) {
    console.log("  ✓ Billing platform health — all checks passed");
    console.log(`  ✓ Checked at ${result.checkedAt}\n`);
    process.exit(0);
  }

  console.log("\n  Billing platform health — issues detected:\n");
  for (const issue of result.issues) {
    console.log(`  ✗ ${BILLING_HEALTH_ISSUE_LABELS[issue]}`);
  }
  console.log("");
  process.exit(1);
} catch (error) {
  console.error(`  ✗ Billing health probe error — ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
