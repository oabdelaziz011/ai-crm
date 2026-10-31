#!/usr/bin/env node
/**
 * Embedding worker entry for the VPS image.
 * Listens on 127.0.0.1 only so Compose can health-check it. That port is not published.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platformWorkerProblems } from "../../scripts/check-production-worker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const problems = platformWorkerProblems(process.env);
if (problems.length) {
  console.error(["VPS worker configuration is not ready.", ...problems.map((problem) => `  - ${problem}`)].join("\n"));
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx/esm", "src/embedding-worker.ts"],
  {
    cwd: resolve(root, "artifacts/platform-worker"),
    env: process.env,
    stdio: "inherit",
  },
);

const health = createServer((req, res) => {
  const alive = child.exitCode == null && !child.killed;
  if (req.url === "/healthz") {
    res.writeHead(alive ? 200 : 503, { "content-type": "text/plain" });
    res.end(alive ? "ok" : "stopped");
    return;
  }
  res.writeHead(404);
  res.end();
});
health.listen(3002, "127.0.0.1");

function stop(signal) {
  child.kill(signal);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => stop(signal));
}

child.on("exit", (code) => {
  health.close(() => process.exit(code ?? 1));
});
