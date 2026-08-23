#!/usr/bin/env node
/**
 * Development-only: watch source, rebuild with esbuild, restart dist/main.mjs.
 * Production start remains scripts/start-with-env.mjs (no watch).
 */
import { spawn, execFileSync } from "node:child_process";
import { watch, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMissingEnvHelp,
  loadProjectEnv,
  validateApiServerEnv,
} from "../../../scripts/lib/load-project-env.mjs";
import {
  getListeningPids,
  killProcessTree,
  reclaimStaleApiServerPort,
} from "../../../scripts/cloudflare/spawn-utils.mjs";
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
const LOCK_FILE = resolve(apiServerRoot, ".dev-watch.lock");

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireDevWatchLock() {
  if (existsSync(LOCK_FILE)) {
    const previousPid = Number(readFileSync(LOCK_FILE, "utf8").trim());
    if (isProcessAlive(previousPid)) {
      console.error(
        `[api-server:dev] Another dev watcher is already running (pid ${previousPid}).`,
      );
      console.error(
        "[api-server:dev] Stop the existing terminal or run: pnpm dev:api in only one session.",
      );
      process.exit(1);
    }
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // stale lock — continue
    }
  }

  writeFileSync(LOCK_FILE, String(process.pid), "utf8");
}

function releaseDevWatchLock() {
  try {
    if (existsSync(LOCK_FILE) && readFileSync(LOCK_FILE, "utf8").trim() === String(process.pid)) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // ignore
  }
}

function listExistingDevWatchPids() {
  if (process.platform !== "win32") return [];
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*dev-watch.mjs*' } | Select-Object -ExpandProperty ProcessId",
      ],
      { encoding: "utf8", shell: false },
    ).trim();
    if (!output) return [];
    return output
      .split(/\s+/)
      .map((value) => Number(value))
      .filter(Number.isFinite);
  } catch {
    return [];
  }
}

function assertSingleDevWatchInstance() {
  const existing = listExistingDevWatchPids().filter((pid) => pid !== process.pid);
  if (existing.length === 0) return;

  console.error(
    `[api-server:dev] Found ${existing.length} existing dev watcher process(es): ${existing.join(", ")}`,
  );
  console.error(
    "[api-server:dev] Close those terminals first, then run exactly one: pnpm dev:api",
  );
  process.exit(1);
}

async function waitForPortFree(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getListeningPids(port).length === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  const blockers = getListeningPids(port);
  throw new Error(
    `Port ${port} is still in use after stopping api-server (pids: ${blockers.join(", ") || "unknown"}).`,
  );
}

async function ensurePortFreeForRestart() {
  try {
    await waitForPortFree(listenPort, 10_000);
    return;
  } catch {
    console.warn("[api-server:dev] Port still busy after stop; reclaiming stale api-server listener(s)...");
    reclaimStaleApiServerPort(listenPort, projectRoot);
    await waitForPortFree(listenPort, 10_000);
  }
}

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
const listenPort = Number(childEnv.PORT ?? "3000");

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

async function stopServer() {
  if (!server || server.killed || server.exitCode !== null) {
    server = null;
    return;
  }

  const child = server;
  const childPid = child.pid;
  server = null;

  await new Promise((resolveStop) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveStop();
    };

    child.once("exit", finish);
    killProcessTree(childPid);
    setTimeout(finish, 5_000);
  });

  await ensurePortFreeForRestart();
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
  releaseDevWatchLock();
  process.exit(signal === "SIGINT" ? 0 : 0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

acquireDevWatchLock();
assertSingleDevWatchInstance();
reclaimStaleApiServerPort(listenPort, projectRoot);

await rebuildAndMaybeRestart({ clean: true, reason: "initial" });
