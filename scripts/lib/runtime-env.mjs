import { loadProjectEnv } from "./load-project-env.mjs";

/**
 * Load project env files into a map and hydrate process.env.
 * Precedence: existing process.env wins; profile files per VALUEOR_ENV.
 * Does not load artifacts/login-app/.env.local.
 */
export function loadRuntimeEnv(projectRoot, options = {}) {
  return loadProjectEnv(projectRoot, {
    ...options,
    hydrateProcessEnv: options.hydrateProcessEnv ?? true,
    assertSafety: options.assertSafety ?? true,
  });
}

export { loadProjectEnv, normalizeProjectEnv } from "./load-project-env.mjs";

export function resolveOpenAiApiKey(env = process.env) {
  return (env.OPENAI_API_KEY ?? "").trim();
}
