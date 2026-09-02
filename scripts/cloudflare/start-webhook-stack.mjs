#!/usr/bin/env node
/**
 * Dev stack for WhatsApp webhook ingress:
 *   - reuse existing project API on PORT when healthy (e.g. pnpm dev:api / dev-watch)
 *   - otherwise start api-server on PORT (default 3000)
 *   - named Cloudflare Tunnel (stable hostname → localhost:PORT)
 */
import { PROJECT_ROOT } from "./env-utils.mjs";
import { loadProjectEnv, validateApiServerEnv, formatMissingEnvHelp } from "../lib/load-project-env.mjs";
import {
  debugLog,
  findListeningProjectApiServer,
  killProcessTree,
  reclaimStaleApiServerPort,
  reclaimStaleCloudflaredProcesses,
  reclaimStaleWebhookStackProcesses,
  resolveApiServerStartLaunch,
  resolveCloudflaredLaunch,
  resolveWebhookApiLifecycle,
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
const portNumber = Number(port);
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

const inspection = findListeningProjectApiServer(portNumber, PROJECT_ROOT);
const lifecycle = resolveWebhookApiLifecycle(inspection);
debugLog("webhook api lifecycle", lifecycle);

if (lifecycle.action === "fail") {
  const details = `  pid ${inspection.pid}: ${inspection.commandLine || "(unknown command)"}`;
  throw new Error(
    `Port ${port} is already in use by a non-api-server process.\n${details}\nStop that process, then rerun pnpm dev:webhook.`,
  );
}

reclaimStaleCloudflaredProcesses(PROJECT_ROOT);

if (lifecycle.action === "reuse") {
  const owner =
    inspection.ownership === "dev_watch"
      ? "dev-watch"
      : inspection.ownership === "webhook"
        ? "webhook stack"
        : "project";
  console.log(
    `Reusing existing project API on port ${port} (pid ${inspection.pid}, owned by ${owner}).`,
  );
  console.log("Skipping API reclaim/spawn — Cloudflare tunnel will target the existing server.");
} else {
  reclaimStaleWebhookStackProcesses(PROJECT_ROOT, process.pid, Number(port));
  reclaimStaleApiServerPort(portNumber, PROJECT_ROOT);
  console.log(`Starting api-server on port ${port}...`);
  const apiLaunch = resolveApiServerStartLaunch(PROJECT_ROOT);
  start("api-server", apiLaunch, {
    ...envMap,
    PORT: port,
    NODE_ENV: envMap.NODE_ENV ?? "development",
  });
}

console.log("Starting named Cloudflare Tunnel...");
start("cloudflared", resolveCloudflaredLaunch(PROJECT_ROOT));
