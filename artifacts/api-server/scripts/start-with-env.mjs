#!/usr/bin/env node
/**
 * Start api-server with project env loaded from root `.env` (Windows-safe).
 * Mirrors login-app/scripts/dev-with-env.mjs — Replit injected secrets; local dev uses files.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMissingEnvHelp,
  loadProjectEnv,
  validateApiServerEnv,
} from "../../../scripts/lib/load-project-env.mjs";

const apiServerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(apiServerRoot, "../..");

const env = loadProjectEnv(projectRoot, {
  hydrateProcessEnv: true,
  mergeProcessEnv: true,
});
const validation = validateApiServerEnv(env);

if (!validation.ok) {
  console.error(formatMissingEnvHelp(projectRoot, validation.missing));
  process.exit(1);
}

const childEnv = {
  ...process.env,
  ...env,
};

const nodeArgs = ["--enable-source-maps", resolve(apiServerRoot, "dist/main.mjs")];
const child = spawn(process.execPath, nodeArgs, {
  cwd: apiServerRoot,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
