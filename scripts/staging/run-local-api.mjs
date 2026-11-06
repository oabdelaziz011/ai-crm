#!/usr/bin/env node
/**
 * Start the existing API on this PC with VALUEOR_ENV=staging.
 * Does not load the Production .env and does not open a tunnel.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertStagingEnvironmentSafety } from "../lib/env-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stagingFile = resolve(root, ".env.staging");

if (!existsSync(stagingFile)) {
  console.error("STAGING API NOT STARTED. Add .env.staging from .env.staging.example. The Production .env was not read.");
  process.exit(2);
}

const fileEnv = {};
for (const line of readFileSync(stagingFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || !match[2]) continue;
  fileEnv[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
fileEnv.VALUEOR_ENV = "staging";
fileEnv.PORT ??= "3011";
fileEnv.VITE_API_SERVER_URL ??= `http://127.0.0.1:${fileEnv.PORT}`;

try {
  assertStagingEnvironmentSafety(fileEnv);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging configuration was rejected.");
  console.error("STAGING API NOT STARTED. No server was launched.");
  process.exit(2);
}

const childEnv = { ...process.env, ...fileEnv, VALUEOR_ENV: "staging" };
delete childEnv.CLOUDFLARE_TUNNEL_TOKEN;
delete childEnv.CLOUDFLARE_TUNNEL_CONFIG;

const child = spawn(
  process.execPath,
  [resolve(root, "scripts/run-with-valueor-env.mjs"), "staging", "--", "pnpm", "--dir", "artifacts/api-server", "run", "dev"],
  { cwd: root, env: childEnv, stdio: "inherit", shell: false },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
