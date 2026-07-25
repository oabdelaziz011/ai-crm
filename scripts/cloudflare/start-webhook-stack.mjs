#!/usr/bin/env node
/**
 * Dev stack for WhatsApp webhook ingress:
 *   - api-server on PORT (default 3000)
 *   - named Cloudflare Tunnel (stable hostname)
 */
import { execFileSync, spawn } from "node:child_process";
import { PROJECT_ROOT, readEnvFile } from "./env-utils.mjs";

const env = readEnvFile().values;
const port = env.get("PORT") ?? "3000";

const children = [];

function start(label, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Building api-server...");
execFileSync("pnpm", ["--dir", "artifacts/api-server", "run", "build"], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log(`Starting api-server on port ${port}...`);
start("api-server", "pnpm", ["--dir", "artifacts/api-server", "start"], PROJECT_ROOT, {
  PORT: port,
  NODE_ENV: "development",
});

console.log("Starting named Cloudflare Tunnel...");
start("cloudflared", "node", ["scripts/cloudflare/run-tunnel.mjs"], PROJECT_ROOT);
