#!/usr/bin/env node
/**
 * Development-only: watch source, rebuild with esbuild, restart dist/main.mjs.
 * Production start remains scripts/start-with-env.mjs (no watch).
 */
import { spawn, execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMissingEnvHelp,
  loadProjectEnv,
  validateApiServerEnv,
} from "../../../scripts/lib/load-project-env.mjs";
import { buildApiServer } from "../build.mjs";

const apiServerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(apiServerRoot, "../..");
const entryPoint = resolve(apiServerRoot, "dist/main.mjs");
const watchRoots = [
  resolve(apiServerRoot, "src"),
  resolve(projectRoot, "lib"),
  resolve(projectRoot, "artifacts/login-app/src"),
];

const DEBOUNCE_MS = 200;

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

/** @type {import("node:child_process").ChildProcess | null} */
let server = null;
let building = false;
let pendingRebuild = false;
let shuttingDown = false;

function readGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function printStartupBanner(buildInfo) {
  const lines = [
    "",
    "========== [API-SERVER DEV] ==========",
    `Build timestamp: ${buildInfo.builtAt}`,
    `Git commit:      ${readGitCommit()}`,
    `Entry point:     ${entryPoint}`,
    `Build duration:  ${buildInfo.durationMs} ms`,
    "======================================",
    "",
  ];
  console.log(lines.join("\n"));
}

function stopServer() {
  return new Promise((resolveStop) => {
    if (!server || server.killed || server.exitCode !== null) {
      server = null;
      resolveStop();
      return;
    }

    const child = server;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      server = null;
      resolveStop();
    };

    child.once("exit", finish);
    child.kill("SIGTERM");

    setTimeout(() => {
      if (!settled && child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 5_000);
  });
}

async function startServer(buildInfo) {
  printStartupBanner(buildInfo);
  server = spawn(process.execPath, ["--enable-source-maps", entryPoint], {
    cwd: apiServerRoot,
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });

  server.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (building || pendingRebuild) return;
    if (signal) {
      console.error(`[api-server:dev] Server exited via ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[api-server:dev] Server exited with code ${code} (left stopped; fix and save to rebuild)`);
    }
  });
}

async function rebuildAndMaybeRestart({ clean, reason }) {
  if (building) {
    pendingRebuild = true;
    return;
  }

  building = true;
  pendingRebuild = false;

  console.log(`[api-server:dev] Building${reason ? ` (${reason})` : ""}...`);

  try {
    const buildInfo = await buildApiServer({ clean });
    console.log(`[api-server:dev] Build ok in ${buildInfo.durationMs} ms`);
    await stopServer();
    await startServer(buildInfo);
  } catch (error) {
    console.error("[api-server:dev] Build failed — keeping current server process (if any)");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
  } finally {
    building = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      await rebuildAndMaybeRestart({ clean: false, reason: "queued change" });
    }
  }
}

function shouldIgnoreWatchPath(filename) {
  if (!filename) return true;
  const normalized = filename.replace(/\\/g, "/");
  return (
    normalized.includes("node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/.git/") ||
    normalized.endsWith(".tsbuildinfo") ||
    normalized.endsWith(".swp") ||
    normalized.endsWith("~")
  );
}

/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;

function scheduleRebuild(changedPath) {
  if (shuttingDown) return;
  const label = changedPath ? relative(projectRoot, changedPath) : "filesystem";
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void rebuildAndMaybeRestart({ clean: false, reason: label });
  }, DEBOUNCE_MS);
}

const watchers = watchRoots.map((root) => {
  try {
    const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
      if (shouldIgnoreWatchPath(filename ?? undefined)) return;
      const changed = filename ? resolve(root, filename) : root;
      scheduleRebuild(changed);
    });
    watcher.on("error", (error) => {
      console.error(`[api-server:dev] Watcher error on ${root}:`, error);
    });
    console.log(`[api-server:dev] Watching ${relative(projectRoot, root) || root}`);
    return watcher;
  } catch (error) {
    console.error(`[api-server:dev] Failed to watch ${root}:`, error);
    process.exit(1);
  }
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  for (const watcher of watchers) watcher.close();
  await stopServer();
  process.exit(signal === "SIGINT" ? 0 : 0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await rebuildAndMaybeRestart({ clean: true, reason: "initial" });
