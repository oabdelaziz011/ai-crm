/**
 * Start Vite with Supabase env sourced from project .env (not stale shell VITE_*).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
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

const viteEnv = {
  VITE_SUPABASE_URL:
    rootEnv.VITE_SUPABASE_URL ||
    rootEnv.SUPABASE_URL ||
    existingLocal.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    rootEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    rootEnv.SUPABASE_PUBLISHABLE_KEY ||
    existingLocal.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_API_SERVER_URL:
    rootEnv.VITE_API_SERVER_URL || existingLocal.VITE_API_SERVER_URL,
};

if (!viteEnv.VITE_SUPABASE_URL || !viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    "Missing Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in project .env",
  );
  process.exit(1);
}

writeFileSync(
  envLocalPath,
  [
    `VITE_SUPABASE_URL=${viteEnv.VITE_SUPABASE_URL}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    ...(viteEnv.VITE_API_SERVER_URL ? [`VITE_API_SERVER_URL=${viteEnv.VITE_API_SERVER_URL}`] : []),
  ].join("\n") + "\n",
  "utf8",
);

const childEnv = { ...process.env, ...viteEnv };
delete childEnv.VITE_SUPABASE_ANON_KEY;

const viteArgs = ["vite", "--config", "vite.config.ts", "--host", "0.0.0.0", "--port", "5173"];
const child = spawn("pnpm", ["exec", ...viteArgs], {
  cwd: loginAppRoot,
  env: childEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
