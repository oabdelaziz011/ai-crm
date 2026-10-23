/**
 * LOCAL ONLY: rotate the active platform OpenAI key from env OPENAI_API_KEY.
 * Never prints the key. Does not touch production.
 *
 * Usage (from repo root, with local stack env):
 *   set OPENAI_API_KEY=sk-...
 *   node scripts/run-with-valueor-env.mjs local -- node scripts/rotate-local-platform-openai-key.mjs
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { loadDevScriptEnv } from "./lib/dev-script-env.mjs";
import { resolveValueorEnv, VALUEOR_ENV_LOCAL } from "./lib/env-mode.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const mode = resolveValueorEnv(env.VALUEOR_ENV ?? process.env.VALUEOR_ENV);
if (mode !== VALUEOR_ENV_LOCAL) {
  console.error("Refusing to rotate platform keys outside VALUEOR_ENV=local.");
  process.exit(1);
}

const apiKey = String(env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
if (!apiKey || apiKey.length < 20) {
  console.error("Set OPENAI_API_KEY in the environment (min length 20). Key is never printed.");
  process.exit(1);
}

const url = String(env.SUPABASE_URL ?? "").trim();
const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
  console.error("Refusing: SUPABASE_URL is not local.", url);
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: provider, error: providerError } = await sb
  .from("platform_ai_providers")
  .select("id, provider_key")
  .eq("provider_key", "openai")
  .maybeSingle();
if (providerError || !provider?.id) {
  console.error("openai_provider_missing", providerError?.message ?? null);
  process.exit(1);
}

const { data: encrypted, error: encryptError } = await sb.rpc("platform_ai_encrypt_key", {
  p_plaintext: apiKey,
});
if (encryptError || !encrypted) {
  console.error("encrypt_failed", encryptError?.message ?? null);
  process.exit(1);
}

const { error: deactivateError } = await sb
  .from("platform_ai_provider_keys")
  .update({ is_active: false })
  .eq("provider_id", provider.id)
  .eq("is_active", true);
if (deactivateError) {
  console.error("deactivate_failed", deactivateError.message);
  process.exit(1);
}

const hint = apiKey.slice(-4);
const { data: inserted, error: insertError } = await sb
  .from("platform_ai_provider_keys")
  .insert({
    provider_id: provider.id,
    key_label: `local-rotate-${new Date().toISOString().slice(0, 10)}`,
    encrypted_key: encrypted,
    key_hint: hint,
    is_active: true,
  })
  .select("id, key_hint, is_active, created_at")
  .single();

if (insertError) {
  console.error("insert_failed", insertError.message);
  process.exit(1);
}

const { data: readiness } = await sb.rpc("platform_ai_provider_readiness", {
  p_provider_key: "openai",
});

console.log(
  JSON.stringify(
    {
      ok: true,
      providerId: provider.id,
      keyId: inserted.id,
      keyHint: inserted.key_hint,
      readinessReady: readiness?.ready === true,
      readinessHint: readiness?.keyHint ?? null,
    },
    null,
    2,
  ),
);
