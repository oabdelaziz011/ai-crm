import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function loadSupabaseEnv(projectRoot) {
  const env = {};
  const paths = [
    resolve(projectRoot, "artifacts/login-app/.env.local"),
    resolve(projectRoot, ".env"),
  ];

  for (const filePath of paths) {
    try {
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) continue;
        env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }

  return env;
}

export function resolveSupabaseConfig(env, processEnv = process.env) {
  const url =
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    processEnv.VITE_SUPABASE_URL ||
    processEnv.SUPABASE_URL;
  const key =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    processEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    processEnv.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export function resolveProjectRoot(fromModuleUrl) {
  const __dirname = dirname(fileURLToPath(fromModuleUrl));
  return resolve(__dirname, "..");
}

export function resolveLoginAppRoot(fromModuleUrl) {
  const __dirname = dirname(fileURLToPath(fromModuleUrl));
  return resolve(__dirname, "../..");
}
