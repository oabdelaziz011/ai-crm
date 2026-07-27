/**
 * Sprint AI-Platform E2E validation.
 * Run: npx tsx scripts/platform-ai-provider-e2e.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { loadSupabaseEnv, resolveProjectRoot, resolveSupabaseConfig } from "./lib/supabase-env.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolveProjectRoot(import.meta.url);
const evidenceDir = resolve(root, "docs/operations/evidence/platform-ai-provider");
mkdirSync(evidenceDir, { recursive: true });

const DEMO_PASSWORD = "DemoVault2026!";
const COMPANY_ALPHA = "d0000010-0001-4001-8001-000000000001";
const COMPANY_BETA = "d0000010-0001-4001-8001-000000000002";
const PLATFORM_ADMIN = "demo-platform@vaultos.local";
const ALPHA_ADMIN = "demo-alpha-admin@vaultos.local";
const BETA_ADMIN = "demo-beta-admin@vaultos.local";

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${detail}`);
}

async function signIn(url: string, key: string, email: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client, userId: data.user!.id };
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase config missing");

  const platform = await signIn(config.url, config.key, PLATFORM_ADMIN);
  const alpha = await signIn(config.url, config.key, ALPHA_ADMIN);
  const beta = await signIn(config.url, config.key, BETA_ADMIN);
  const platformServices = createPlatformAIProviderServices(platform.client);

  const { data: providers } = await platform.client.from("platform_ai_providers").select("id, provider_key");
  record("Platform providers readable by super admin", (providers?.length ?? 0) > 0, `count=${providers?.length ?? 0}`);

  const { data: tenantKeys, error: tenantKeyError } = await alpha.client
    .from("platform_ai_provider_keys")
    .select("id");
  record(
    "Tenant cannot read platform API keys",
    tenantKeyError != null || (tenantKeys?.length ?? 0) === 0,
    tenantKeyError?.message ?? "zero rows",
  );

  const alphaRuntime = await platformServices.platform.resolveRuntimeConfig(COMPANY_ALPHA, "openai", "chat");
  record("Company A runtime config resolves", Boolean(alphaRuntime.apiKey), `model=${alphaRuntime.model}`);

  const betaRuntime = await platformServices.platform.resolveRuntimeConfig(COMPANY_BETA, "openai", "chat");
  record("Company B runtime config resolves", Boolean(betaRuntime.apiKey), `model=${betaRuntime.model}`);

  const { data: alphaConnections } = await alpha.client
    .from("ai_provider_connections")
    .select("id, configuration, uses_platform_key")
    .limit(5);
  const leakedKeys = (alphaConnections ?? []).filter(
    (row) => typeof row.configuration?.apiKey === "string" && row.configuration.apiKey.length > 0,
  );
  record(
    "Tenant connection rows do not expose apiKey",
    leakedKeys.length === 0,
    leakedKeys.length === 0 ? "sanitized" : `${leakedKeys.length} leak(s)`,
  );

  await platformServices.platform.setFeatureFlag(
    { userId: platform.userId, companyId: null, isSuperAdmin: true, hasPermission: () => true },
    COMPANY_BETA,
    "ai_chat",
    false,
  );

  let betaBlocked = false;
  try {
    await createPlatformAIProviderServices(beta.client).platform.resolveRuntimeConfig(COMPANY_BETA, "openai", "chat");
  } catch (error) {
    betaBlocked = true;
    record("Company B blocked when AI disabled", true, error instanceof Error ? error.message : String(error));
  }
  if (!betaBlocked) record("Company B blocked when AI disabled", false, "expected failure");

  await platformServices.platform.setFeatureFlag(
    { userId: platform.userId, companyId: null, isSuperAdmin: true, hasPermission: () => true },
    COMPANY_BETA,
    "ai_chat",
    true,
  );

  const alphaAfter = await createPlatformAIProviderServices(alpha.client).platform.resolveRuntimeConfig(
    COMPANY_ALPHA,
    "openai",
    "chat",
  );
  record("Company A still works after B toggle", Boolean(alphaAfter.apiKey), `model=${alphaAfter.model}`);

  const report = {
    executedAt: new Date().toISOString(),
    checks,
    allPassed: checks.every((check) => check.pass),
  };
  writeFileSync(resolve(evidenceDir, "platform-ai-e2e-report.json"), JSON.stringify(report, null, 2));
  if (!report.allPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
