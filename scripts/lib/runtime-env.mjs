import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_ENV_FILES = [
  ".env",
  "artifacts/login-app/.env.local",
  "artifacts/platform-worker/.env",
];

/**
 * Load project env files into a map and optionally hydrate process.env.
 * Precedence: existing process.env wins; first file wins among files.
 */
export function loadRuntimeEnv(projectRoot, options = {}) {
  const files = options.files ?? DEFAULT_ENV_FILES;
  const hydrateProcessEnv = options.hydrateProcessEnv ?? true;
  const env = {};

  for (const relativePath of files) {
    const filePath = resolve(projectRoot, relativePath);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!value) continue;
      env[key] ??= value;
    }
  }

  if (hydrateProcessEnv) {
    for (const [key, value] of Object.entries(env)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }

  return env;
}

export function resolveOpenAiApiKey(env = process.env) {
  return (env.OPENAI_API_KEY ?? "").trim();
}
