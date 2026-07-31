import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
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

export function isProjectCloudflaredProcess(commandLine, projectRoot) {
  const normalized = (commandLine ?? "").replace(/\\/g, "/");
  const configPath = resolve(projectRoot, "infra/cloudflare/config.yml").replace(/\\/g, "/");
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

export function killProcessTree(pid) {
  if (!pid) return;
  debugLog("killProcessTree", { pid });

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: false });
      return;
    } catch {
      // Fall through to signal kill.
    }
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may already be gone.
  }
}

export function reclaimStaleApiServerPort(port, projectRoot) {
  const listeners = getListeningPids(port);
  if (listeners.length === 0) return;

  const apiServerRoot = resolve(projectRoot, "artifacts/api-server").replace(/\\/g, "/");
  const stale = [];

  for (const pid of listeners) {
    const commandLine = getProcessCommandLine(pid).replace(/\\/g, "/");
    if (!isApiServerProcess(commandLine)) continue;
    if (!commandLine.includes(apiServerRoot) && !commandLine.includes("artifacts/api-server")) continue;
    stale.push({ pid, commandLine });
  }

  if (stale.length === 0) {
    const blockers = listeners.map((pid) => ({ pid, commandLine: getProcessCommandLine(pid) }));
    const details = blockers
      .map((entry) => `  pid ${entry.pid}: ${entry.commandLine || "(unknown command)"}`)
      .join("\n");
    throw new Error(
      `Port ${port} is already in use by a non-api-server process.\n${details}\nStop that process, then rerun pnpm dev:webhook.`,
    );
  }

  console.warn(
    `Port ${port} is held by stale api-server process(es) from a previous dev:webhook run. Reclaiming port...`,
  );
  for (const entry of stale) {
    debugLog("reclaim stale api-server", entry);
    killProcessTree(entry.pid);
  }

  const remaining = getListeningPids(port);
  if (remaining.length > 0) {
    throw new Error(`Port ${port} is still in use after reclaiming stale api-server process(es).`);
  }
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
