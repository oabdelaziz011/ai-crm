#!/usr/bin/env node
/**
 * Check the production API process profile. Does not start the server unless --start is passed,
 * and --start still refuses an invalid profile.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { productionRuntimeProblems } from "./lib/production-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const env = loadProjectEnv(root, {
  valueorEnv: "production",
  hydrateProcessEnv: false,
  mergeProcessEnv: false,
});
const problems = productionRuntimeProblems(env);
if (problems.length) {
  console.error(["Production API profile is not ready.", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
  process.exit(1);
}

if (!process.argv.includes("--start")) {
  console.log("Production API profile passed. Re-run with --start to launch the built server.");
  process.exit(0);
}

const child = spawn(process.execPath, ["scripts/start-with-env.mjs"], {
  cwd: resolve(root, "artifacts/api-server"),
  env: { ...process.env, ...env, VALUEOR_ENV: "production", NODE_ENV: "production" },
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
