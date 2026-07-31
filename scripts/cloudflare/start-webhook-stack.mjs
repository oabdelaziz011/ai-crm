#!/usr/bin/env node
/**
 * Dev stack for WhatsApp webhook ingress:
 *   - api-server on PORT (default 3000)
 *   - named Cloudflare Tunnel (stable hostname)
 */
import { PROJECT_ROOT } from "./env-utils.mjs";
import { loadProjectEnv, validateApiServerEnv, formatMissingEnvHelp } from "../lib/load-project-env.mjs";
import {
  debugLog,
  killProcessTree,
  reclaimStaleApiServerPort,
  reclaimStaleCloudflaredProcesses,
  resolveApiServerStartLaunch,
  resolveCloudflaredLaunch,
  runPnpmSync,
  snapshotProcessTree,
  spawnLogged,
} from "./spawn-utils.mjs";

const envMap = loadProjectEnv(PROJECT_ROOT, {
  hydrateProcessEnv: true,
  mergeProcessEnv: true,
});
const validation = validateApiServerEnv(envMap);

if (!validation.ok) {
  console.error(formatMissingEnvHelp(PROJECT_ROOT, validation.missing));
  process.exit(1);
}

const port = envMap.PORT ?? process.env.PORT ?? "3000";
const children = [];

function start(label, launch, extraEnv = {}) {
  const child = spawnLogged(label, launch.command, launch.args, {
    cwd: launch.cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${label}] exited due to signal ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });

  children.push({ label, child });
  return child;
}

function shutdown(code = 0) {
  debugLog("shutdown", { code, childCount: children.length });
  snapshotProcessTree("before-shutdown");

  for (const entry of children) {
    if (!entry.child.killed) {
      killProcessTree(entry.child.pid);
    }
  }

  snapshotProcessTree("after-shutdown");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

debugLog("start-webhook-stack boot", {
  parentPid: process.pid,
  ppid: process.ppid,
  platform: process.platform,
  port,
});

console.log("Building api-server...");
runPnpmSync(["--dir", "artifacts/api-server", "run", "build"], { cwd: PROJECT_ROOT });

reclaimStaleApiServerPort(Number(port), PROJECT_ROOT);
reclaimStaleCloudflaredProcesses(PROJECT_ROOT);

console.log(`Starting api-server on port ${port}...`);
const apiLaunch = resolveApiServerStartLaunch(PROJECT_ROOT);
start("api-server", apiLaunch, {
  ...envMap,
  PORT: port,
  NODE_ENV: envMap.NODE_ENV ?? "development",
});

console.log("Starting named Cloudflare Tunnel...");
start("cloudflared", resolveCloudflaredLaunch(PROJECT_ROOT));
