/**
 * Sprint P4 production smoke checks.
 * Run: node scripts/production-smoke.mjs
 */
import { loadDevScriptEnv, requireEnvValue, resolveLoginCredentials } from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const apiBase = requireEnvValue(env, ["API_SERVER_URL"], "API base URL (API_SERVER_URL)");
const { email: EMAIL, password: PASSWORD } = resolveLoginCredentials(env);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    return { label, ok: true, ms: Math.round(performance.now() - t0), result };
  } catch (error) {
    return {
      label,
      ok: false,
      ms: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkHealth(path) {
  const response = await fetch(`${apiBase}${path}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return body;
}

async function checkSupabaseAuth() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase env missing");
  }
  const { createClient } = await import(
    "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
  );
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  const { data: profile } = await sb
    .from("profiles")
    .select("company_id")
    .limit(1)
    .maybeSingle();
  return { companyId: profile?.company_id ?? null };
}

async function main() {
  const results = [];

  results.push(await timed("health", () => checkHealth("/health")));
  results.push(await timed("ready", () => checkHealth("/ready")));
  results.push(await timed("status", () => checkHealth("/status")));
  results.push(await timed("supabase_auth", checkSupabaseAuth));

  const failed = results.filter((item) => !item.ok);
  const report = {
    capturedAt: new Date().toISOString(),
    apiBase,
    results,
    passed: failed.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
