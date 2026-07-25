#!/usr/bin/env node
/**
 * Run the named Cloudflare Tunnel (never a quick tunnel).
 *
 * Modes:
 *   1. CLOUDFLARE_TUNNEL_TOKEN in .env  -> cloudflared tunnel run --token ...
 *   2. infra/cloudflare/config.yml        -> cloudflared tunnel --config ... run
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, readEnvFile } from "./env-utils.mjs";

const CONFIG_PATH = path.join(PROJECT_ROOT, "infra/cloudflare/config.yml");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const envFile = readEnvFile();
  const token = envFile.values.get("CLOUDFLARE_TUNNEL_TOKEN")?.trim();

  let args;
  if (token) {
    console.log("Starting named Cloudflare Tunnel (token mode)...");
    args = ["tunnel", "run", "--token", token];
  } else if (fs.existsSync(CONFIG_PATH)) {
    console.log(`Starting named Cloudflare Tunnel using ${CONFIG_PATH} ...`);
    args = ["tunnel", "--config", CONFIG_PATH, "run"];
  } else {
    fail(
      [
        "Named tunnel is not configured.",
        "",
        "Option A — CLI-managed tunnel (stable hostname via DNS route):",
        "  1. Set CLOUDFLARE_TUNNEL_NAME and CLOUDFLARE_TUNNEL_HOSTNAME in .env",
        "  2. cloudflared tunnel login",
        "  3. pnpm tunnel:setup",
        "  4. pnpm tunnel:run",
        "",
        "Option B — Zero Trust dashboard token:",
        "  1. Create a named tunnel + public hostname in Cloudflare Zero Trust",
        "  2. Set CLOUDFLARE_TUNNEL_TOKEN in .env",
        "  3. pnpm tunnel:run",
        "",
        "Do NOT use: cloudflared tunnel --url http://localhost:3000",
      ].join("\n"),
    );
  }

  const child = spawn("cloudflared", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
