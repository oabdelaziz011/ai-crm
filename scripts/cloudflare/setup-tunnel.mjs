#!/usr/bin/env node
/**
 * One-time (or idempotent) setup for a named Cloudflare Tunnel with a stable hostname.
 *
 * Prerequisites:
 *   1. Domain zone on Cloudflare
 *   2. cloudflared installed
 *   3. cloudflared tunnel login   (creates ~/.cloudflared/cert.pem)
 *
 * Required .env keys (set before running):
 *   CLOUDFLARE_TUNNEL_NAME=vaultos-webhook
 *   CLOUDFLARE_TUNNEL_HOSTNAME=webhook.yourdomain.com
 *
 * Optional:
 *   PORT or API_SERVER_PORT (default 3000)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  PROJECT_ROOT,
  readEnvFile,
  requireEnv,
  resolveUserCloudflaredDir,
  upsertEnvVars,
} from "./env-utils.mjs";

const CLOUDFLARE_DIR = path.join(PROJECT_ROOT, "infra/cloudflare");
const CONFIG_PATH = path.join(CLOUDFLARE_DIR, "config.yml");
const META_PATH = path.join(CLOUDFLARE_DIR, "tunnel-meta.json");
const TEMPLATE_PATH = path.join(CLOUDFLARE_DIR, "config.template.yml");

function runCloudflared(args) {
  return execFileSync("cloudflared", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function ensureLoggedIn() {
  const certPath = path.join(resolveUserCloudflaredDir(), "cert.pem");
  if (!fs.existsSync(certPath)) {
    console.error("\nCloudflare origin certificate not found.");
    console.error("Run once (opens browser):\n");
    console.error("  cloudflared tunnel login\n");
    process.exit(1);
  }
}

function parseTunnelList(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  return lines.slice(1).map((line) => {
    const parts = line.split(/\s+/);
    const id = parts[0];
    const name = parts[1];
    return { id, name };
  });
}

function getOrCreateTunnel(tunnelName) {
  let listed = "";
  try {
    listed = runCloudflared(["tunnel", "list"]);
  } catch {
    listed = "";
  }

  const existing = parseTunnelList(listed).find((item) => item.name === tunnelName);
  if (existing) {
    console.log(`Using existing tunnel "${tunnelName}" (${existing.id})`);
    return existing;
  }

  console.log(`Creating tunnel "${tunnelName}"...`);
  runCloudflared(["tunnel", "create", tunnelName]);

  const refreshed = runCloudflared(["tunnel", "list"]);
  const created = parseTunnelList(refreshed).find((item) => item.name === tunnelName);
  if (!created) {
    throw new Error(`Tunnel "${tunnelName}" was not found after creation.`);
  }

  console.log(`Created tunnel "${tunnelName}" (${created.id})`);
  return created;
}

function routeDns(tunnelName, hostname) {
  console.log(`Routing DNS ${hostname} -> tunnel "${tunnelName}"...`);
  try {
    runCloudflared(["tunnel", "route", "dns", tunnelName, hostname]);
    console.log("DNS route applied.");
  } catch (error) {
    console.warn(`DNS route command returned non-zero (record may already exist): ${error.message}`);
  }
}

function resolveCredentialsFile(tunnelId) {
  const credentialsPath = path.join(resolveUserCloudflaredDir(), `${tunnelId}.json`);
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Credentials file not found: ${credentialsPath}`);
  }
  return credentialsPath;
}

function writeConfig({ tunnelId, credentialsFile, hostname, port }) {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const yaml = template
    .replaceAll("${CLOUDFLARE_TUNNEL_ID}", tunnelId)
    .replaceAll("${CLOUDFLARE_TUNNEL_CREDENTIALS_FILE}", credentialsFile.replace(/\\/g, "/"))
    .replaceAll("${CLOUDFLARE_TUNNEL_HOSTNAME}", hostname)
    .replaceAll("${API_SERVER_PORT}", String(port));

  fs.mkdirSync(CLOUDFLARE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, yaml, "utf8");

  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        tunnelId,
        tunnelName: readEnvFile().values.get("CLOUDFLARE_TUNNEL_NAME") ?? null,
        hostname,
        port,
        credentialsFile,
        configPath: CONFIG_PATH,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function main() {
  ensureLoggedIn();

  const env = readEnvFile().values;
  const { CLOUDFLARE_TUNNEL_NAME, CLOUDFLARE_TUNNEL_HOSTNAME } = requireEnv(
    ["CLOUDFLARE_TUNNEL_NAME", "CLOUDFLARE_TUNNEL_HOSTNAME"],
    env,
  );
  const port = Number(env.get("API_SERVER_PORT") ?? env.get("PORT") ?? "3000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT/API_SERVER_PORT must be a positive number.");
  }

  const tunnel = getOrCreateTunnel(CLOUDFLARE_TUNNEL_NAME);
  routeDns(CLOUDFLARE_TUNNEL_NAME, CLOUDFLARE_TUNNEL_HOSTNAME);

  const credentialsFile = resolveCredentialsFile(tunnel.id);
  writeConfig({
    tunnelId: tunnel.id,
    credentialsFile,
    hostname: CLOUDFLARE_TUNNEL_HOSTNAME,
    port,
  });

  const publicBase = `https://${CLOUDFLARE_TUNNEL_HOSTNAME}`;
  // Public tunnel hostname is for Meta → webhook ingress only.
  // Browser → api-server (Test Connection, etc.) should stay on the local/dev API origin.
  upsertEnvVars({
    CLOUDFLARE_TUNNEL_ID: tunnel.id,
    WEBHOOK_BASE_URL: publicBase,
    VITE_WEBHOOK_BASE_URL: publicBase,
  });
  upsertEnvVars(
    {
      VITE_WEBHOOK_BASE_URL: publicBase,
    },
    path.join(PROJECT_ROOT, "artifacts/login-app/.env.local"),
  );

  console.log("\nNamed tunnel configured.");
  console.log(`  Config:     ${CONFIG_PATH}`);
  console.log(`  Hostname:   ${CLOUDFLARE_TUNNEL_HOSTNAME}`);
  console.log(`  Upstream:   http://localhost:${port}`);
  console.log(`  Webhook:    ${publicBase}/api/webhooks/whatsapp`);
  console.log("  Keep VITE_API_SERVER_URL pointed at the browser-reachable API (e.g. http://localhost:3000).");
  console.log("\nStart the stack:");
  console.log("  pnpm dev:webhook");
  console.log("\nRegister this webhook URL in Meta Developer Console (stable across restarts).");
}

main();
