/**
 * Fail-closed checks for a real production API process.
 * Does not read secret values back to the caller; problems name the key only.
 */

export const DEV_SECRET_PLACEHOLDERS = new Set([
  "dev-secret",
  "dev-secret-change-me",
  "dev-internal-api-key",
  "dev-saas-sandbox-webhook",
]);

const PRODUCTION_WEBHOOK_ORIGIN = "https://webhook.valueor.org";

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDevSecretPlaceholder(value) {
  return DEV_SECRET_PLACEHOLDERS.has(String(value ?? "").trim());
}

export function isLoopbackUrl(value) {
  if (!present(value)) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function productionRuntimeProblems(env) {
  const problems = [];
  if (env.VALUEOR_ENV !== "production") {
    problems.push("VALUEOR_ENV must be production.");
  }
  if (env.NODE_ENV !== "production") {
    problems.push("NODE_ENV must be production.");
  }
  if (!present(env.SESSION_SECRET) || isDevSecretPlaceholder(env.SESSION_SECRET)) {
    problems.push("SESSION_SECRET must be a non-placeholder production secret.");
  }
  if (!present(env.INTERNAL_API_KEY) || isDevSecretPlaceholder(env.INTERNAL_API_KEY)) {
    problems.push("INTERNAL_API_KEY must be a non-placeholder production secret.");
  }
  if (env.WEBHOOK_BASE_URL?.replace(/\/+$/, "") !== PRODUCTION_WEBHOOK_ORIGIN) {
    problems.push("WEBHOOK_BASE_URL must be https://webhook.valueor.org.");
  }
  if (!present(env.VITE_API_SERVER_URL) || isLoopbackUrl(env.VITE_API_SERVER_URL)) {
    problems.push("VITE_API_SERVER_URL must be the supervised production API origin, not loopback.");
  }
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  if (!/\.supabase\.co\b/i.test(supabaseUrl)) {
    problems.push("SUPABASE_URL must be the hosted Production project.");
  }
  if (env.BILLING_LIFECYCLE_WORKER_ENABLED === "true" && env.BILLING_LIFECYCLE_WORKER_CONFIRMED !== "true") {
    problems.push(
      "BILLING_LIFECYCLE_WORKER_ENABLED=true requires BILLING_LIFECYCLE_WORKER_CONFIRMED=true after the production process is validated.",
    );
  }
  return problems;
}
