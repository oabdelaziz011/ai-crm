/**
 * Inspect platform AI provider keys and runtime resolution (metadata only).
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

await sb.auth.signInWithPassword({ email, password });

console.log("=== platform_ai_providers ===");
const { data: providers, error: pErr } = await sb.from("platform_ai_providers").select("*");
console.log("error", pErr?.message ?? null);
for (const p of providers ?? []) {
  console.log(JSON.stringify({ id: p.id, provider_key: p.provider_key, display_name: p.display_name, is_enabled: p.is_enabled }));
}

console.log("\n=== platform_ai_provider_keys (metadata only - no decrypt) ===");
const { data: keys, error: kErr } = await sb
  .from("platform_ai_provider_keys")
  .select("id, provider_id, key_label, key_hint, is_active, rotated_at, created_at, encrypted_key")
  .order("created_at", { ascending: false });
console.log("error", kErr?.message ?? null);
for (const k of keys ?? []) {
  console.log(
    JSON.stringify({
      id: k.id,
      provider_id: k.provider_id,
      key_label: k.key_label,
      key_hint: k.key_hint,
      is_active: k.is_active,
      encrypted_key_is_null: k.encrypted_key == null,
      encrypted_key_length: k.encrypted_key ? (typeof k.encrypted_key === "string" ? k.encrypted_key.length : "bytea") : 0,
      rotated_at: k.rotated_at,
      created_at: k.created_at,
    }),
  );
}

console.log("\n=== platform_resolve_ai_runtime_config ===");
const { data: runtimeCfg, error: rtErr } = await sb.rpc("platform_resolve_ai_runtime_config", {
  p_company_id: companyId,
  p_provider_key: "openai",
  p_use_case: "chat",
});
console.log("error", rtErr?.message ?? null);
if (runtimeCfg) {
  console.log(
    JSON.stringify({
      providerKey: runtimeCfg.providerKey,
      model: runtimeCfg.model,
      usesPlatformKey: runtimeCfg.usesPlatformKey,
      apiKeyPresent: Boolean(runtimeCfg.apiKey && runtimeCfg.apiKey.length > 8),
      apiKeyPrefix: runtimeCfg.apiKey ? runtimeCfg.apiKey.slice(0, 8) : null,
      apiKeyLength: runtimeCfg.apiKey?.length ?? 0,
    }),
  );
}

console.log("\n=== default tenant connection ===");
const { data: conn } = await sb
  .from("ai_provider_connections")
  .select("id, uses_platform_key, is_default, configuration")
  .eq("company_id", companyId)
  .eq("is_default", true)
  .maybeSingle();
console.log(JSON.stringify(conn));
