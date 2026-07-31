/**
 * Verifies Platform AI Settings wiring: super-admin upsert + runtime resolution.
 *
 * Required env:
 *   VERIFY_EMAIL, VERIFY_PASSWORD
 *   VERIFY_COMPANY_ID
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveLoginCredentials,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const { email, password } = resolveLoginCredentials(env);
const companyId = requireEnvValue(env, ["VERIFY_COMPANY_ID", "COMPANY_ID"], "company id (VERIFY_COMPANY_ID)");

const sb = createClient(
  requireEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
);

const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error("sign_in_failed", signInError.message);
  process.exit(1);
}

const { data: providers } = await sb.from("platform_ai_providers").select("id, provider_key").eq("provider_key", "openai").maybeSingle();
if (!providers?.id) {
  console.error("openai_provider_missing");
  process.exit(1);
}

const { data: beforeKeys } = await sb
  .from("platform_ai_provider_keys")
  .select("id, key_hint, is_active, created_at")
  .eq("provider_id", providers.id)
  .order("created_at", { ascending: false });

const activeBefore = beforeKeys?.find((k) => k.is_active);
console.log("before_active", activeBefore ?? null);

const testKey = `sk-test-rotate-${Date.now()}-abcdefghijklmnop`;
const { data: encrypted, error: encryptError } = await sb.rpc("platform_ai_encrypt_key", {
  p_plaintext: testKey,
});
if (encryptError) {
  console.error("encrypt_failed", encryptError.message);
  process.exit(1);
}

await sb.from("platform_ai_provider_keys").update({ is_active: false }).eq("provider_id", providers.id).eq("is_active", true);

const { data: inserted, error: insertError } = await sb
  .from("platform_ai_provider_keys")
  .insert({
    provider_id: providers.id,
    key_label: "verify-rotation",
    encrypted_key: encrypted,
    key_hint: testKey.slice(-4),
    is_active: true,
  })
  .select("id, key_hint, is_active, created_at")
  .single();

if (insertError) {
  console.error("insert_failed", insertError.message);
  process.exit(1);
}

console.log("inserted_active_row", inserted);

const { data: runtimeCfg, error: rtErr } = await sb.rpc("platform_resolve_ai_runtime_config", {
  p_company_id: companyId,
  p_provider_key: "openai",
  p_use_case: "chat",
});
if (rtErr) {
  console.error("runtime_resolve_failed", rtErr.message);
  process.exit(1);
}

const runtimeHint = runtimeCfg?.apiKey?.slice(-4) ?? null;
console.log(
  "runtime_after_rotation",
  JSON.stringify({
    usesPlatformKey: runtimeCfg?.usesPlatformKey,
    model: runtimeCfg?.model,
    apiKeyPresent: Boolean(runtimeCfg?.apiKey),
    apiKeyHint: runtimeHint,
    matchesInsertedHint: runtimeHint === inserted.key_hint,
  }),
);

if (runtimeHint !== inserted.key_hint) {
  console.error("runtime_key_mismatch");
  process.exit(1);
}

console.log("verify_ok");
