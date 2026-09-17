/**
 * Start Vite with VALUEOR_ENV-aware client env (default: local).
 * Syncs login-app/.env.local from `.env.localstack` in local mode — never production root `.env`.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoServerSecretsInViteEnv,
  isProductionSupabaseUrl,
  isProductionWebhookUrl,
  resolveValueorEnv,
  VALUEOR_ENV_LOCAL,
} from "../../../scripts/lib/env-mode.mjs";

const loginAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(loginAppRoot, "../..");
const envLocalPath = resolve(loginAppRoot, ".env.local");

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
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

const mode = resolveValueorEnv(process.env.VALUEOR_ENV || VALUEOR_ENV_LOCAL);
process.env.VALUEOR_ENV = mode;

if (mode === VALUEOR_ENV_LOCAL) {
  const ensure = spawnSync(
    process.execPath,
    [resolve(projectRoot, "scripts/ensure-localstack-env.mjs")],
    { cwd: projectRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (ensure.status !== 0) {
    process.exit(ensure.status ?? 1);
  }
}

const source =
  mode === VALUEOR_ENV_LOCAL
    ? parseEnvFile(resolve(projectRoot, ".env.localstack"))
    : parseEnvFile(resolve(projectRoot, ".env"));

const viteEnv = {
  VITE_SUPABASE_URL: source.VITE_SUPABASE_URL || source.SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    source.VITE_SUPABASE_PUBLISHABLE_KEY ||
    source.SUPABASE_PUBLISHABLE_KEY ||
    source.SUPABASE_ANON_KEY,
  VITE_API_SERVER_URL:
    source.VITE_API_SERVER_URL ||
    (mode === VALUEOR_ENV_LOCAL ? "http://localhost:3000" : undefined),
  VITE_APP_ORIGIN:
    source.VITE_APP_ORIGIN ||
    (mode === VALUEOR_ENV_LOCAL ? "http://localhost:5173" : source.FRONTEND_ORIGIN) ||
    "http://localhost:5173",
};

if (source.VITE_WEBHOOK_BASE_URL || source.WEBHOOK_BASE_URL) {
  const webhook = source.VITE_WEBHOOK_BASE_URL || source.WEBHOOK_BASE_URL;
  if (!(mode === VALUEOR_ENV_LOCAL && isProductionWebhookUrl(webhook))) {
    viteEnv.VITE_WEBHOOK_BASE_URL = webhook;
  }
}

if (!viteEnv.VITE_SUPABASE_URL || !viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    mode === VALUEOR_ENV_LOCAL
      ? "Missing local Supabase config. Run: node scripts/ensure-localstack-env.mjs"
      : "Missing Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in project .env",
  );
  process.exit(1);
}

if (mode === VALUEOR_ENV_LOCAL && isProductionSupabaseUrl(viteEnv.VITE_SUPABASE_URL)) {
  console.error("LOCAL ENVIRONMENT SAFETY CHECK FAILED");
  console.error("  - VITE_SUPABASE_URL (production supabase.co host)");
  process.exit(1);
}

assertNoServerSecretsInViteEnv(viteEnv);

writeFileSync(
  envLocalPath,
  Object.entries(viteEnv)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  "utf8",
);

const childEnv = { ...process.env, ...viteEnv, VALUEOR_ENV: mode };
delete childEnv.VITE_SUPABASE_ANON_KEY;
delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
delete childEnv.DATABASE_URL;
delete childEnv.SUPABASE_DB_PASSWORD;

const viteArgs = ["vite", "--config", "vite.config.ts", "--host", "0.0.0.0", "--port", "5173"];
const child = spawn("pnpm", ["exec", ...viteArgs], {
  cwd: loginAppRoot,
  env: childEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
