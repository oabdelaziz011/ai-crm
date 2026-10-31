/**
 * Hostname checks for the single-VPS production layout.
 * Names problems only. Does not read or return secret values.
 */
import { isLocalDatabaseUrl, isRecordedProductionDatabaseUrl, isRecordedProductionSupabaseUrl } from "./env-mode.mjs";
import { productionRuntimeProblems } from "./production-runtime.mjs";

export const VPS_PUBLIC_URLS = {
  VITE_APP_ORIGIN: "https://app.valueor.org",
  FRONTEND_ORIGIN: "https://app.valueor.org",
  VITE_SITE_URL: "https://app.valueor.org",
  VITE_API_SERVER_URL: "https://api.valueor.org",
  WEBHOOK_BASE_URL: "https://webhook.valueor.org",
  VITE_WEBHOOK_BASE_URL: "https://webhook.valueor.org",
  PUBLIC_WEBHOOK_BASE_URL: "https://webhook.valueor.org",
};

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function vpsProcessProblems(env) {
  const problems = productionRuntimeProblems(env);
  for (const [key, expected] of Object.entries(VPS_PUBLIC_URLS)) {
    const actual = String(env[key] ?? "").trim().replace(/\/+$/, "");
    if (actual !== expected) problems.push(`${key} must be ${expected}.`);
  }
  if (env.EMBEDDING_WORKER_ENABLED === "false") {
    problems.push("EMBEDDING_WORKER_ENABLED must stay enabled for the worker service.");
  }
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    const value = String(env[key] ?? "").trim();
    if (value && !isRecordedProductionSupabaseUrl(value)) {
      problems.push(`${key} must be the recorded hosted Production project.`);
    }
  }
  if (env.DATABASE_URL?.trim() && (isLocalDatabaseUrl(env.DATABASE_URL) || !isRecordedProductionDatabaseUrl(env.DATABASE_URL))) {
    problems.push("DATABASE_URL must be the hosted Supabase database.");
  }
  for (const [key, value] of Object.entries(env)) {
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal|:54321\b|:54322\b/i.test(String(value ?? ""))) {
      problems.push(`${key} contains a local address.`);
    }
  }
  return [...new Set(problems)];
}
