#!/usr/bin/env node
/**
 * Temporary HTTPS tunnel to the local staging API.
 * Uses cloudflared's quick tunnel. It does not use a Production tunnel token or hostname.
 */
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { stagingTunnelAllowsPrintedHost, stagingTunnelChildEnv, stagingTunnelPlan } from "./tunnel-plan.mjs";

const port = process.env.STAGING_PORT || process.env.PORT || "3011";
const plan = stagingTunnelPlan(port);
const found = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["cloudflared"], { encoding: "utf8" });

if (found.status !== 0) {
  console.error(
    [
      "cloudflared is not installed.",
      "Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ and run this command again.",
      "Do not start the Production tunnel scripts for this staging API.",
    ].join("\n"),
  );
  process.exit(2);
}

const child = spawn("cloudflared", plan.args, {
  stdio: ["ignore", "pipe", "pipe"],
  env: stagingTunnelChildEnv(process.env),
  shell: false,
});

function watch(stream) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    process.stderr.write(`${line}\n`);
    const match = line.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
    if (!match) return;
    if (!stagingTunnelAllowsPrintedHost(match[1])) {
      console.error("The tunnel hostname is not a temporary trycloudflare host. Stopping.");
      child.kill("SIGTERM");
      return;
    }
    console.error(`Temporary device API URL: https://${match[1]}`);
    console.error("Put that URL in EXPO_PUBLIC_API_URL for the mobile Metro session. Stop this process when the test ends.");
  });
}

watch(child.stdout);
watch(child.stderr);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
