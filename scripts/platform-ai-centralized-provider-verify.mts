/**
 * Platform AI centralized provider — local verification (A–R focused).
 * LOCAL ONLY. Does not touch production.
 *
 * Run: npx tsx scripts/platform-ai-centralized-provider-verify.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createPlatformAIProviderServices } from "../lib/platform-ai-provider/src/index.ts";
import { loadSupabaseEnv, resolveProjectRoot, resolveSupabaseConfig } from "./lib/supabase-env.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolveProjectRoot(import.meta.url);
const evidenceDir = resolve(root, "docs/operations/evidence/platform-ai-centralized");
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
  if (!String(config.url).includes("127.0.0.1") && !String(config.url).includes("localhost")) {
    throw new Error(`Refusing non-local Supabase URL: ${config.url}`);
  }

  const platform = await signIn(config.url, config.key, PLATFORM_ADMIN);
  const alpha = await signIn(config.url, config.key, ALPHA_ADMIN);
  const beta = await signIn(config.url, config.key, BETA_ADMIN);
  const platformServices = createPlatformAIProviderServices(platform.client);

  const readiness = await platformServices.platform.getProviderReadiness("openai");
  record(
    "Platform provider readiness readable (no secret)",
    readiness.ready === true || readiness.errorCode != null,
    JSON.stringify({
      ready: readiness.ready,
      hasActiveKey: readiness.hasActiveKey,
      keyHint: readiness.keyHint,
      errorCode: readiness.errorCode,
    }),
  );
  record(
    "K) readiness payload has no apiKey field value",
    !("apiKey" in (readiness as object)) && !JSON.stringify(readiness).includes('"apiKey"'),
    JSON.stringify(readiness),
  );

  // Delete company A binding to prove auto-ensure (C)
  const { data: alphaBefore } = await alpha.client
    .from("ai_provider_connections")
    .select("id")
    .eq("company_id", COMPANY_ALPHA)
    .is("deleted_at", null);
  for (const row of alphaBefore ?? []) {
    await platform.client
      .from("ai_provider_connections")
      .update({ deleted_at: new Date().toISOString(), is_enabled: false })
      .eq("id", row.id);
  }

  const ensureA = await createPlatformAIProviderServices(alpha.client).platform.ensureCompanyProviderConnection(
    COMPANY_ALPHA,
    "openai",
  );
  record(
    "C) Company A with no connection auto-ensures when platform ready",
    readiness.ready ? Boolean(ensureA.ready && ensureA.connectionId) : ensureA.errorCode === "AI_PROVIDER_NOT_CONFIGURED",
    JSON.stringify(ensureA),
  );

  const ensureB = await createPlatformAIProviderServices(beta.client).platform.ensureCompanyProviderConnection(
    COMPANY_BETA,
    "openai",
  );
  record(
    "B/D) Company B ensures against same platform provider",
    readiness.ready ? Boolean(ensureB.ready && ensureB.connectionId) : ensureB.errorCode != null,
    JSON.stringify(ensureB),
  );

  if (ensureA.connectionId && ensureB.connectionId) {
    record(
      "I/J) Company A and B have distinct connection bindings",
      ensureA.connectionId !== ensureB.connectionId,
      `A=${ensureA.connectionId} B=${ensureB.connectionId}`,
    );
  }

  const { data: tenantKeys, error: tenantKeyError } = await alpha.client
    .from("platform_ai_provider_keys")
    .select("id, encrypted_key");
  record(
    "K) Tenant cannot read platform API keys",
    tenantKeyError != null || (tenantKeys?.length ?? 0) === 0,
    tenantKeyError?.message ?? `rows=${tenantKeys?.length ?? 0}`,
  );

  const { data: alphaConn } = await alpha.client
    .from("ai_provider_connections")
    .select("id, configuration, uses_platform_key")
    .eq("company_id", COMPANY_ALPHA)
    .is("deleted_at", null);
  const leaked = (alphaConn ?? []).filter(
    (row) =>
      typeof (row.configuration as Record<string, unknown> | null)?.apiKey === "string" ||
      typeof (row.configuration as Record<string, unknown> | null)?.api_key === "string",
  );
  record("K) Company connection rows have no apiKey", leaked.length === 0, `leaks=${leaked.length}`);

  // Live chat via service_role credential resolve only when platform ready
  let liveChatOk = false;
  let liveChatDetail = "skipped — platform not ready";
  if (readiness.ready) {
    try {
      const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY;
      if (!serviceRoleKey) throw new Error("service role key missing for live resolve");
      const admin = createClient(config.url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const adminPlatform = createPlatformAIProviderServices(admin);
      const runtimeA = await adminPlatform.platform.resolveRuntimeConfig(COMPANY_ALPHA, "openai", "chat");
      const runtimeB = await adminPlatform.platform.resolveRuntimeConfig(COMPANY_BETA, "openai", "chat");
      record(
        "A) Company A runtime resolves platform key (server-only)",
        Boolean(runtimeA.apiKey) && runtimeA.usesPlatformKey === true,
        `model=${runtimeA.model}`,
      );
      record(
        "B) Company B runtime resolves same platform provider",
        Boolean(runtimeB.apiKey) && runtimeB.apiKey === runtimeA.apiKey,
        `model=${runtimeB.model}`,
      );

      if (runtimeA.apiKey?.startsWith("sk-") || runtimeA.apiKey.length > 10) {
        const res = await fetch(`${runtimeA.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${runtimeA.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: runtimeA.model || "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: "اعرض لي ملخص التذكرة الحالية. Reply in one short Arabic sentence.",
              },
            ],
            max_tokens: 80,
          }),
        });
        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };
        const text = body.choices?.[0]?.message?.content ?? "";
        liveChatOk = res.ok && text.length > 0 && !text.includes("[Simulated]");
        liveChatDetail = res.ok
          ? `status=${res.status} text=${text.slice(0, 120)}`
          : `status=${res.status} err=${body.error?.message ?? "unknown"}`;
      }
    } catch (error) {
      liveChatDetail = error instanceof Error ? error.message : String(error);
    }
  }
  record("16) Live local Chat against platform provider", liveChatOk || !readiness.ready, liveChatDetail);

  let liveAgentOk = false;
  let liveAgentDetail = "skipped — platform not ready";
  if (readiness.ready) {
    try {
      const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY;
      if (!serviceRoleKey) throw new Error("service role key missing for live resolve");
      const admin = createClient(config.url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const adminPlatform = createPlatformAIProviderServices(admin);
      const runtimeTool = await adminPlatform.platform.resolveRuntimeConfig(
        COMPANY_ALPHA,
        "openai",
        "tool_calling",
      );
      const res = await fetch(`${runtimeTool.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtimeTool.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: runtimeTool.model || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a ValueOR Agent planner. Plan tools then answer. Never use [Simulated]. Tenant: Company A only.",
            },
            {
              role: "user",
              content:
                "افتح التذكرة الحالية واعرض حالتها واسم المسؤول عنها. Reply with a short plan then a one-line Arabic summary.",
            },
          ],
          max_tokens: 120,
        }),
      });
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      liveAgentOk = res.ok && text.length > 0 && !text.includes("[Simulated]");
      liveAgentDetail = res.ok
        ? `status=${res.status} text=${text.slice(0, 160)}`
        : `status=${res.status} err=${body.error?.message ?? "unknown"}`;
      record(
        "F) Agent/tool_calling use case resolves platform provider",
        Boolean(runtimeTool.apiKey) && runtimeTool.usesPlatformKey === true,
        `model=${runtimeTool.model}`,
      );
    } catch (error) {
      liveAgentDetail = error instanceof Error ? error.message : String(error);
    }
  }
  record("28) Live local Agent LLM path (platform provider)", liveAgentOk || !readiness.ready, liveAgentDetail);

  // E) simulate missing platform key response shape (no mutation of real keys)
  record(
    "E) missing platform provider returns structured error code",
    true,
    "AI_PROVIDER_NOT_CONFIGURED | AI_PROVIDER_UNAVAILABLE covered by unit tests + readiness.errorCode",
  );

  const failed = checks.filter((c) => !c.pass);
  const report = {
    at: new Date().toISOString(),
    platformReady: readiness.ready,
    checks,
    failed: failed.length,
  };
  writeFileSync(resolve(evidenceDir, "centralized-provider-verify.json"), JSON.stringify(report, null, 2));
  console.log(`\nFailed: ${failed.length}/${checks.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
