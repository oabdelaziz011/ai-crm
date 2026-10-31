#!/usr/bin/env node
/**
 * Check the embedding worker profile. Does not start the worker.
 * Live provider calls are out of scope.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { isDevSecretPlaceholder } from "./lib/production-runtime.mjs";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function platformWorkerProblems(env) {
  const problems = [];
  if (env.NODE_ENV !== "production") problems.push("NODE_ENV must be production.");
  if (!env.SUPABASE_URL?.includes(".supabase.co")) problems.push("SUPABASE_URL must be the hosted project.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim() || isDevSecretPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY)) {
    problems.push("SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  if (env.EMBEDDING_WORKER_ENABLED === "false") {
    problems.push("EMBEDDING_WORKER_ENABLED is false.");
  }
  if (!env.ALERT_WEBHOOK_URL?.trim()) {
    problems.push("ALERT_WEBHOOK_URL is unset. Worker failures will only reach local logs.");
  }
  return problems;
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const env = loadProjectEnv(root, {
    valueorEnv: "production",
    hydrateProcessEnv: false,
    mergeProcessEnv: false,
  });
  const problems = platformWorkerProblems(env);
  if (problems.length) {
    console.error(["Platform worker is not ready for production supervision.", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
    process.exit(1);
  }
  console.log("Platform worker profile passed. Supervise it with: pnpm --dir artifacts/platform-worker start");
}
