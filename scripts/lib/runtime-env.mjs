import { loadProjectEnv } from "./load-project-env.mjs";

/**
 * Load project env files into a map and optionally hydrate process.env.
 * Precedence: existing process.env wins; first file wins among files.
 */
export function loadRuntimeEnv(projectRoot, options = {}) {
  return loadProjectEnv(projectRoot, options);
}

export { loadProjectEnv, normalizeProjectEnv } from "./load-project-env.mjs";

export function resolveOpenAiApiKey(env = process.env) {
  return (env.OPENAI_API_KEY ?? "").trim();
}
