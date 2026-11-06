#!/usr/bin/env node
/**
 * Hosted staging entry kept for a later paid deploy. The current no-cost path is
 * `pnpm dev:api:staging` on this PC. This file still starts the same API build.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertStagingEnvironmentSafety } from "../../scripts/lib/env-mode.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

try {
  assertStagingEnvironmentSafety({ ...process.env, VALUEOR_ENV: "staging" });
} catch (error) {
  const message = error instanceof Error ? error.message : "Staging configuration was rejected.";
  console.error(message);
  process.exit(1);
}

const child = spawn(process.execPath, [resolve(root, "artifacts/api-server/dist/main.mjs")], {
  cwd: root,
  env: { ...process.env, VALUEOR_ENV: "staging" },
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
