/**
 * Sync Supabase VITE_* vars from project root .env into login-app/.env.local.
 * Vite reads .env.local at startup; process.env VITE_* from a prior test run
 * can otherwise override file values and leave the browser pointed at localhost:54321.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const loginAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(loginAppRoot, "../..");
const envLocalPath = resolve(loginAppRoot, ".env.local");

function parseEnvFile(filePath) {
  const env = {};
  try {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  return env;
}

const rootEnv = parseEnvFile(resolve(projectRoot, ".env"));
const existingLocal = parseEnvFile(envLocalPath);

const supabaseUrl =
  rootEnv.VITE_SUPABASE_URL ||
  rootEnv.SUPABASE_URL ||
  existingLocal.VITE_SUPABASE_URL;
const supabaseKey =
  rootEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  rootEnv.SUPABASE_PUBLISHABLE_KEY ||
  existingLocal.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiServerUrl =
  rootEnv.VITE_API_SERVER_URL ||
  existingLocal.VITE_API_SERVER_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in project .env",
  );
  process.exit(1);
}

const lines = [
  `VITE_SUPABASE_URL=${supabaseUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${supabaseKey}`,
];
if (apiServerUrl) {
  lines.push(`VITE_API_SERVER_URL=${apiServerUrl}`);
}

writeFileSync(envLocalPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Synced ${envLocalPath}`);
