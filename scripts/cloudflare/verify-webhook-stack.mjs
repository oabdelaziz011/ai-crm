#!/usr/bin/env node
/**
 * Automated verification for dev:webhook stack lifecycle on Windows.
 * Usage: node scripts/cloudflare/verify-webhook-stack.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import {
  getListeningPids,
  getProcessCommandLine,
  isApiServerProcess,
  listProjectCloudflaredProcesses,
  reclaimStaleApiServerPort,
  reclaimStaleCloudflaredProcesses,
} from "./spawn-utils.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const logPath = resolve(projectRoot, "tmp/webhook-stack-verification.log");
const cycles = Number(process.env.WEBHOOK_VERIFY_CYCLES ?? "5");
const startupTimeoutMs = 120_000;
const shutdownTimeoutMs = 20_000;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  logStream.write(`${line}\n`);
}

const logStream = createWriteStream(logPath, { flags: "w" });

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function netstatPort3000() {
  try {
    return execFileSync("cmd.exe", ["/c", "netstat -ano | findstr :3000"], {
      encoding: "utf8",
      shell: false,
    }).trim();
  } catch {
    return "";
  }
}

function listMainMjsProcesses() {
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'dist[\\\\/]main\\.mjs' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", shell: false },
    ).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function listCloudflaredFromProject() {
  return listProjectCloudflaredProcesses(projectRoot);
}

function preflightCleanup() {
  reclaimStaleApiServerPort(3000, projectRoot);
  reclaimStaleCloudflaredProcesses(projectRoot);
}

function assertCleanShutdown(cycle) {
  const netstat = netstatPort3000();
  const hasListen = /LISTENING/i.test(netstat);
  const mainProcs = listMainMjsProcesses();
  const tunnels = listCloudflaredFromProject();

  log(`cycle ${cycle} post-shutdown netstat:\n${netstat || "(empty)"}`);
  log(`cycle ${cycle} post-shutdown main.mjs count=${mainProcs.length}`);
  log(`cycle ${cycle} post-shutdown cloudflared count=${tunnels.length}`);

  if (hasListen) {
    throw new Error(`cycle ${cycle}: port 3000 still LISTENING after shutdown\n${netstat}`);
  }
  if (mainProcs.length > 0) {
    throw new Error(`cycle ${cycle}: orphan dist/main.mjs remains: ${JSON.stringify(mainProcs)}`);
  }
  if (tunnels.length > 0) {
    throw new Error(`cycle ${cycle}: orphan cloudflared remains: ${JSON.stringify(tunnels)}`);
  }
}

async function waitForStartup(outputChunks, pid) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    const text = outputChunks.join("");
    const hasListen = /Server listening/i.test(text);
    const hasTunnel = /Starting tunnel tunnelID=/i.test(text) || /Tunnel connection curve preferences/i.test(text);
    const hasAddrInUse = /EADDRINUSE/i.test(text);
    if (hasAddrInUse) {
      throw new Error(`EADDRINUSE during startup:\n${text.slice(-4000)}`);
    }
    if (hasListen && hasTunnel) {
      return text;
    }
    await sleep(500);
  }
  throw new Error(`startup timeout for pid ${pid}. tail:\n${outputChunks.join("").slice(-4000)}`);
}

async function stopStack(child, cycle) {
  log(`cycle ${cycle}: sending SIGINT to stack pid ${child.pid}`);
  child.kill("SIGINT");

  const startedAt = Date.now();
  while (Date.now() - startedAt < shutdownTimeoutMs) {
    if (child.exitCode != null) {
      log(`cycle ${cycle}: stack exited code=${child.exitCode}`);
      await sleep(1500);
      return;
    }
    await sleep(250);
  }

  log(`cycle ${cycle}: stack did not exit in time; force-killing tree ${child.pid}`);
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false });
  } catch {
    // ignore
  }
  await sleep(1500);
}

async function runCycle(cycle) {
  log(`=== cycle ${cycle}/${cycles} start ===`);
  const outputChunks = [];

  execFileSync("node", ["scripts/ensure-root-env.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  });

  const child = spawn("node", ["scripts/cloudflare/start-webhook-stack.mjs"], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    outputChunks.push(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    outputChunks.push(chunk);
  });

  await waitForStartup(outputChunks, child.pid);
  log(`cycle ${cycle}: startup confirmed (Server listening + cloudflared)`);

  await stopStack(child, cycle);
  assertCleanShutdown(cycle);
  log(`cycle ${cycle}: PASS`);
}

async function main() {
  log(`verification boot platform=${process.platform} cycles=${cycles}`);
  preflightCleanup();
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await runCycle(cycle);
  }
  log("ALL CYCLES PASSED");
}

main().catch((error) => {
  log(`VERIFICATION FAILED: ${error.message}`);
  console.error(error);
  process.exit(1);
});
