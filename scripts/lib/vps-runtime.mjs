/**
 * Hostname checks for the single-VPS production layout.
 * Names problems only. Does not read or return secret values.
 */
import { isLocalDatabaseUrl, isRecordedProductionDatabaseUrl, isRecordedProductionSupabaseUrl } from "./env-mode.mjs";
import { productionRuntimeProblems } from "./production-runtime.mjs";

/** Canonical public URLs for the Hetzner Nginx cutover. Frontend may be app or www during migration. */
export const VPS_PUBLIC_URLS = {
  VITE_APP_ORIGIN: "https://app.valueor.org",
  FRONTEND_ORIGIN: "https://app.valueor.org",
  VITE_SITE_URL: "https://app.valueor.org",
  VITE_API_SERVER_URL: "https://api.valueor.org",
  WEBHOOK_BASE_URL: "https://webhook.valueor.org",
  VITE_WEBHOOK_BASE_URL: "https://webhook.valueor.org",
  PUBLIC_WEBHOOK_BASE_URL: "https://webhook.valueor.org",
};

export const VPS_FRONTEND_ORIGINS = new Set([
  "https://app.valueor.org",
  "https://www.valueor.org",
]);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function vpsProcessProblems(env) {
  const problems = productionRuntimeProblems(env);
  for (const key of ["VITE_APP_ORIGIN", "FRONTEND_ORIGIN", "VITE_SITE_URL"]) {
    const actual = String(env[key] ?? "").trim().replace(/\/+$/, "");
    if (!VPS_FRONTEND_ORIGINS.has(actual)) {
      problems.push(`${key} must be https://app.valueor.org or https://www.valueor.org.`);
    }
  }
  for (const [key, expected] of Object.entries(VPS_PUBLIC_URLS)) {
    if (key === "VITE_APP_ORIGIN" || key === "FRONTEND_ORIGIN" || key === "VITE_SITE_URL") continue;
    const actual = String(env[key] ?? "").trim().replace(/\/+$/, "");
    if (actual !== expected) problems.push(`${key} must be ${expected}.`);
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
