#!/usr/bin/env node
/**
 * Production API entry for the VPS image.
 * Reads process environment only. Does not load workstation env files.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vpsProcessProblems } from "../../scripts/lib/vps-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const problems = vpsProcessProblems(process.env);
if (problems.length) {
  console.error(["VPS API configuration is not ready.", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
  process.exit(1);
}

const child = spawn(process.execPath, ["--enable-source-maps", resolve(root, "artifacts/api-server/dist/main.mjs")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
