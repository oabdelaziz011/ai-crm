import { execFileSync, spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG = process.env.WEBHOOK_STACK_DEBUG === "1";

export function debugLog(message, details = {}) {
  if (!DEBUG) return;
  console.log(
    `[webhook-stack ${new Date().toISOString()} pid=${process.pid}] ${message}`,
    Object.keys(details).length > 0 ? details : "",
  );
}

export function resolvePnpmLaunch(args) {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === "string" && /\.m?js$/i.test(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args] };
  }

  if (process.platform === "win32") {
    try {
      const globalRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
        shell: true,
      }).trim();
      return {
        command: process.execPath,
        args: [resolve(globalRoot, "pnpm/bin/pnpm.mjs"), ...args],
      };
    } catch {
      return { command: "pnpm.cmd", args };
    }
  }

  return { command: "pnpm", args };
}

export function runPnpmSync(args, options = {}) {
  const launch = resolvePnpmLaunch(args);
  debugLog("runPnpmSync", { command: launch.command, args: launch.args });
  execFileSync(launch.command, launch.args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

export function spawnLogged(label, command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    shell: false,
  });

  debugLog(`spawn ${label}`, {
    parentPid: process.pid,
    childPid: child.pid,
    command,
    args,
  });

  if (DEBUG && process.platform === "win32") {
    snapshotProcessTree(`${label}-spawned`);
  }

  return child;
}

export function snapshotProcessTree(label) {
  if (!DEBUG) return;
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='cmd.exe' OR Name='cloudflared.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", shell: false },
    );
    debugLog(`process-tree ${label}`, { output: output.trim() });
  } catch (error) {
    debugLog(`process-tree ${label} failed`, { error: error.message });
  }
}

export function getListeningPids(port) {
  if (process.platform === "win32") {
    try {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
        ],
        { encoding: "utf8", shell: false },
      ).trim();
      if (!output) return [];
      return [...new Set(output.split(/\s+/).map((value) => Number(value)).filter(Number.isFinite))];
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      shell: false,
    }).trim();
    if (!output) return [];
    return [...new Set(output.split(/\s+/).map((value) => Number(value)).filter(Number.isFinite))];
  } catch {
    return [];
  }
}

export function getProcessCommandLine(pid) {
  if (process.platform === "win32") {
    try {
      return execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { encoding: "utf8", shell: false },
      ).trim();
    } catch {
      return "";
    }
  }

  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      shell: false,
    }).trim();
  } catch {
    return "";
  }
}

export function isApiServerProcess(commandLine) {
  return /(?:dist[\\/]main\.mjs|start-with-env\.mjs)/i.test(commandLine ?? "");
}

export function isProjectApiServerProcess(commandLine, projectRoot) {
  if (!isApiServerProcess(commandLine)) return false;
  const normalized = (commandLine ?? "").replace(/\\/g, "/");
  const apiServerRoot = resolve(projectRoot, "artifacts/api-server").replace(/\\/g, "/");
  return (
    normalized.includes(apiServerRoot) ||
    normalized.includes("artifacts/api-server") ||
    /(?:^|\s)(?:--enable-source-maps\s+)?dist\/main\.mjs(?:\s|$)/i.test(normalized)
  );
}

export function isDevWatchCommandLine(commandLine) {
  return /dev-watch\.mjs/i.test((commandLine ?? "").replace(/\\/g, "/"));
}

export function isWebhookOwnedApiCommandLine(commandLine) {
  return /start-with-env\.mjs/i.test((commandLine ?? "").replace(/\\/g, "/"));
}

export function getParentPid(pid) {
  if (!pid || !Number.isFinite(pid)) return null;

  if (process.platform === "win32") {
    try {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`,
        ],
        { encoding: "utf8", shell: false },
      ).trim();
      const parentPid = Number(output);
      return Number.isFinite(parentPid) && parentPid > 0 ? parentPid : null;
    } catch {
      return null;
    }
  }

  try {
    const output = execFileSync("ps", ["-p", String(pid), "-o", "ppid="], {
      encoding: "utf8",
      shell: false,
    }).trim();
    const parentPid = Number(output);
    return Number.isFinite(parentPid) && parentPid > 0 ? parentPid : null;
  } catch {
    return null;
  }
}

/**
 * Classify a single listener on the API port.
 * @returns {'project_api_dev_watch'|'project_api_webhook'|'project_api'|'unrelated'}
 */
export function classifyApiPortListener({ commandLine, parentCommandLine, projectRoot }) {
  if (!isProjectApiServerProcess(commandLine, projectRoot)) {
    return "unrelated";
  }
  if (isDevWatchCommandLine(parentCommandLine) || isDevWatchCommandLine(commandLine)) {
    return "project_api_dev_watch";
  }
  if (isWebhookOwnedApiCommandLine(commandLine)) {
    return "project_api_webhook";
  }
  return "project_api";
}

/**
 * Inspect who (if anyone) owns the API listen port.
 * @returns {{
 *   status: 'none'|'project_api'|'unrelated',
 *   ownership: 'dev_watch'|'webhook'|'unknown'|null,
 *   protected: boolean,
 *   pid: number|null,
 *   commandLine: string,
 *   parentPid: number|null,
 *   parentCommandLine: string,
 *   kind: string|null,
 * }}
 */
export function findListeningProjectApiServer(port, projectRoot, deps = {}) {
  const listPids = deps.getListeningPids ?? getListeningPids;
  const readCommandLine = deps.getProcessCommandLine ?? getProcessCommandLine;
  const readParentPid = deps.getParentPid ?? getParentPid;

  const listeners = listPids(port);
  if (listeners.length === 0) {
    return {
      status: "none",
      ownership: null,
      protected: false,
      pid: null,
      commandLine: "",
      parentPid: null,
      parentCommandLine: "",
      kind: null,
    };
  }

  for (const pid of listeners) {
    const commandLine = readCommandLine(pid);
    const parentPid = readParentPid(pid);
    const parentCommandLine = parentPid ? readCommandLine(parentPid) : "";
    const kind = classifyApiPortListener({ commandLine, parentCommandLine, projectRoot });

    if (kind === "unrelated") continue;

    const ownership =
      kind === "project_api_dev_watch"
        ? "dev_watch"
        : kind === "project_api_webhook"
          ? "webhook"
          : "unknown";

    return {
      status: "project_api",
      ownership,
      protected: ownership === "dev_watch",
      pid,
      commandLine,
      parentPid,
      parentCommandLine,
      kind,
    };
  }

  const firstPid = listeners[0];
  return {
    status: "unrelated",
    ownership: null,
    protected: false,
    pid: firstPid,
    commandLine: readCommandLine(firstPid),
    parentPid: null,
    parentCommandLine: "",
    kind: "unrelated",
  };
}

/**
 * Pure decision for webhook stack API lifecycle.
 * @returns {{ action: 'spawn'|'reuse'|'fail', reason: string, inspection: object }}
 */
export function resolveWebhookApiLifecycle(inspection) {
  if (!inspection || inspection.status === "none") {
    return { action: "spawn", reason: "no_listener", inspection };
  }
  if (inspection.status === "project_api") {
    return {
      action: "reuse",
      reason:
        inspection.ownership === "dev_watch"
          ? "dev_watch_owned"
          : inspection.ownership === "webhook"
            ? "webhook_owned"
            : "project_api",
      inspection,
    };
  }
  return { action: "fail", reason: "unrelated_process", inspection };
}

export function resolveCloudflaredConfigPath(projectRoot, env = process.env) {
  const raw = typeof env?.CLOUDFLARE_TUNNEL_CONFIG === "string" ? env.CLOUDFLARE_TUNNEL_CONFIG.trim() : "";
  if (!raw) {
    return resolve(projectRoot, "infra/cloudflare/config.yml");
  }
  return isAbsolute(raw) ? resolve(raw) : resolve(projectRoot, raw);
}

export function isProjectCloudflaredProcess(commandLine, projectRoot, env = process.env) {
  const normalized = (commandLine ?? "").replace(/\\/g, "/");
  const configPath = resolveCloudflaredConfigPath(projectRoot, env).replace(/\\/g, "/");
  return (
    /cloudflared(?:\.exe)?/i.test(normalized) &&
    (normalized.includes(configPath) || normalized.includes("scripts/cloudflare/run-tunnel.mjs"))
  );
}

export function listProjectCloudflaredProcesses(projectRoot) {
  if (process.platform === "win32") {
    try {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", shell: false },
      ).trim();
      if (!output) return [];
      const parsed = JSON.parse(output);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows.filter((row) => isProjectCloudflaredProcess(row.CommandLine, projectRoot));
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync("pgrep", ["-fl", "cloudflared"], {
      encoding: "utf8",
      shell: false,
    }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        return { ProcessId: Number(match[1]), CommandLine: match[2] };
      })
      .filter((row) => row && isProjectCloudflaredProcess(row.CommandLine, projectRoot));
  } catch {
    return [];
  }
}

export function reclaimStaleCloudflaredProcesses(projectRoot) {
  const stale = listProjectCloudflaredProcesses(projectRoot);
  if (stale.length === 0) return;

  console.warn(
    `Found ${stale.length} stale cloudflared process(es) from a previous dev:webhook run. Reclaiming...`,
  );
  for (const entry of stale) {
    debugLog("reclaim stale cloudflared", entry);
    killProcessTree(entry.ProcessId);
  }
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy-wait: reclaim runs synchronously before stack spawn.
  }
}

function listChildPids(pid) {
  if (process.platform === "win32") return [];
  try {
    const output = execFileSync("pgrep", ["-P", String(pid)], {
      encoding: "utf8",
      shell: false,
    }).trim();
    if (!output) return [];
    return [...new Set(output.split(/\s+/).map((value) => Number(value)).filter(Number.isFinite))];
  } catch {
    return [];
  }
}

export function waitForPortFree(port, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (getListeningPids(port).length === 0) return true;
    sleepMs(200);
  }
  return getListeningPids(port).length === 0;
}

export function killProcessTree(pid, signal = "SIGTERM") {
  if (!pid) return;
  debugLog("killProcessTree", { pid, signal });

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: false });
      return;
    } catch {
      // Fall through to signal kill.
    }
  }

  for (const childPid of listChildPids(pid)) {
    killProcessTree(childPid, signal);
  }

  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be gone.
  }
}

function isProjectWebhookStackProcess(commandLine, projectRoot) {
  const normalized = (commandLine ?? "").replace(/\\/g, "/");
  const stackScript = resolve(projectRoot, "scripts/cloudflare/start-webhook-stack.mjs").replace(/\\/g, "/");
  return (
    normalized.includes(stackScript) ||
    normalized.includes("scripts/cloudflare/start-webhook-stack.mjs")
  );
}

export function listProjectWebhookStackProcesses(projectRoot) {
  if (process.platform === "win32") {
    try {
      const output = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'start-webhook-stack\\.mjs' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", shell: false },
      ).trim();
      if (!output) return [];
      const parsed = JSON.parse(output);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows.filter((row) => isProjectWebhookStackProcess(row.CommandLine, projectRoot));
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync("pgrep", ["-fl", "start-webhook-stack.mjs"], {
      encoding: "utf8",
      shell: false,
    }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        return { ProcessId: Number(match[1]), CommandLine: match[2] };
      })
      .filter((row) => row && isProjectWebhookStackProcess(row.CommandLine, projectRoot));
  } catch {
    return [];
  }
}

export function reclaimStaleWebhookStackProcesses(projectRoot, currentPid = process.pid, port = 3000) {
  const stale = listProjectWebhookStackProcesses(projectRoot).filter(
    (entry) => entry.ProcessId !== currentPid,
  );
  if (stale.length === 0) return;

  console.warn(
    `Found ${stale.length} stale dev:webhook stack process(es) from a previous run. Reclaiming...`,
  );
  for (const entry of stale) {
    debugLog("reclaim stale webhook stack", entry);
    killProcessTree(entry.ProcessId, "SIGTERM");
  }

  if (!waitForPortFree(Number(port), 3000)) {
    for (const entry of stale) {
      killProcessTree(entry.ProcessId, "SIGKILL");
    }
    waitForPortFree(Number(port), 2000);
  }
}

export function reclaimStaleApiServerPort(port, projectRoot) {
  const listeners = getListeningPids(port);
  if (listeners.length === 0) return;

  const stale = [];
  const protectedListeners = [];

  for (const pid of listeners) {
    const commandLine = getProcessCommandLine(pid);
    const parentPid = getParentPid(pid);
    const parentCommandLine = parentPid ? getProcessCommandLine(parentPid) : "";
    const kind = classifyApiPortListener({ commandLine, parentCommandLine, projectRoot });

    if (kind === "unrelated") continue;

    if (kind === "project_api_dev_watch") {
      protectedListeners.push({ pid, commandLine, parentPid, parentCommandLine });
      continue;
    }

    stale.push({ pid, commandLine });
  }

  if (protectedListeners.length > 0 && stale.length === 0) {
    const details = protectedListeners
      .map((entry) => `  pid ${entry.pid}: ${entry.commandLine || "(unknown command)"}`)
      .join("\n");
    throw new Error(
      `Port ${port} is held by a live API owned by artifacts/api-server/scripts/dev-watch.mjs.\n${details}\nDo not reclaim this process. Reuse it (pnpm dev:webhook) or stop pnpm dev:api first.`,
    );
  }

  if (stale.length === 0 && protectedListeners.length === 0) {
    const blockers = listeners.map((pid) => ({ pid, commandLine: getProcessCommandLine(pid) }));
    const details = blockers
      .map((entry) => `  pid ${entry.pid}: ${entry.commandLine || "(unknown command)"}`)
      .join("\n");
    throw new Error(
      `Port ${port} is already in use by a non-api-server process.\n${details}\nStop that process, then rerun pnpm dev:webhook.`,
    );
  }

  if (stale.length === 0) return;

  console.warn(
    `Port ${port} is held by stale api-server process(es) from a previous run. Reclaiming port...`,
  );
  for (const entry of stale) {
    debugLog("reclaim stale api-server", entry);
    killProcessTree(entry.pid, "SIGTERM");
  }

  if (waitForPortFree(port, 8000)) return;

  for (const entry of stale) {
    debugLog("force reclaim stale api-server", entry);
    killProcessTree(entry.pid, "SIGKILL");
  }

  if (waitForPortFree(port, 3000)) return;

  const remaining = getListeningPids(port);
  const remainingProtected = remaining.filter((pid) => {
    const commandLine = getProcessCommandLine(pid);
    const parentPid = getParentPid(pid);
    const parentCommandLine = parentPid ? getProcessCommandLine(parentPid) : "";
    return (
      classifyApiPortListener({ commandLine, parentCommandLine, projectRoot }) ===
      "project_api_dev_watch"
    );
  });
  const remainingBlocking = remaining.filter((pid) => !remainingProtected.includes(pid));

  if (remainingBlocking.length === 0) return;

  const details = remainingBlocking
    .map((pid) => `  pid ${pid}: ${getProcessCommandLine(pid) || "(unknown command)"}`)
    .join("\n");
  throw new Error(
    `Port ${port} is still in use after reclaiming stale api-server process(es).\n${details}\nStop that process, then rerun pnpm dev:webhook.`,
  );
}

export function resolveApiServerStartLaunch(projectRoot) {
  const apiServerRoot = resolve(projectRoot, "artifacts/api-server");
  return {
    cwd: apiServerRoot,
    command: process.execPath,
    args: [resolve(apiServerRoot, "scripts/start-with-env.mjs")],
  };
}

export function resolveCloudflaredLaunch(projectRoot) {
  return {
    cwd: projectRoot,
    command: process.execPath,
    args: [resolve(projectRoot, "scripts/cloudflare/run-tunnel.mjs")],
  };
}
