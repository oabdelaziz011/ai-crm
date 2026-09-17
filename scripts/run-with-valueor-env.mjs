#!/usr/bin/env node
/**
 * Run a command with VALUEOR_ENV set (Windows-safe; no cross-env dependency).
 *
 * Usage:
 *   node scripts/run-with-valueor-env.mjs local -- pnpm --dir artifacts/login-app dev
 *   node scripts/run-with-valueor-env.mjs local -- pnpm --dir artifacts/api-server run dev
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const mode = args[0];
const dash = args.indexOf("--");
if (!mode || dash < 0 || dash === args.length - 1) {
  console.error(
    "Usage: node scripts/run-with-valueor-env.mjs <local|production> -- <command...>",
  );
  process.exit(1);
}

const command = args[dash + 1];
const commandArgs = args.slice(dash + 2);
const childEnv = {
  ...process.env,
  VALUEOR_ENV: mode === "prod" ? "production" : mode,
};

const child = spawn(command, commandArgs, {
  env: childEnv,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
