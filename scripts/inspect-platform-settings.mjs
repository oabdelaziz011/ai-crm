/**
 * Inspect platform AI settings and model rows (redacted).
 *
 * Required env: VERIFY_EMAIL, VERIFY_PASSWORD
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveLoginCredentials,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const { email, password } = resolveLoginCredentials(env);

const sb = createClient(
  requireEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"], "Supabase publishable key"),
);

await sb.auth.signInWithPassword({ email, password });

const { data: settings } = await sb.from("platform_ai_settings").select("key, updated_at, value");
console.log("platform_ai_settings (redacted):");
for (const s of settings ?? []) {
  console.log(JSON.stringify({ key: s.key, updated_at: s.updated_at, value_length: s.value?.length ?? 0, value_is_null: s.value == null }));
}

const { data: openaiProvider } = await sb
  .from("platform_ai_providers")
  .select("id, provider_key")
  .eq("provider_key", "openai")
  .maybeSingle();

if (!openaiProvider?.id) {
  console.error("openai provider row missing");
  process.exit(1);
}

const { data: models } = await sb
  .from("platform_ai_models")
  .select("use_case, model_name, is_default, is_enabled, provider_id")
  .eq("provider_id", openaiProvider.id);
console.log("\nplatform_ai_models for openai:");
for (const m of models ?? []) console.log(JSON.stringify(m));
