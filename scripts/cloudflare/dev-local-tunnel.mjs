#!/usr/bin/env node
/**
 * LOCAL per-developer integration tunnel.
 *
 * Starts ONLY the developer-specific Cloudflare tunnel from `.env.local.integration`.
 * Never uses vaultos-webhook / webhook.valueor.org / infra/cloudflare/config.yml.
 *
 * Prerequisites:
 *   - VALUEOR_ENV=local
 *   - Local API listening on localhost:3001
 *   - Per-developer cloudflared config (CLOUDFLARE_TUNNEL_CONFIG)
 *   - PUBLIC_WEBHOOK_BASE_URL set to that developer's public hostname
 *
 * Does NOT start the API or frontend. Does NOT touch production Meta/DNS.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLocalDeveloperTunnelSafety,
  buildWebhookCallbackUrls,
  LOCAL_API_ORIGIN,
  LOCAL_API_PORT,
  LOCAL_INTEGRATION_ENV_FILE,
  readLocalIntegrationEnv,
  resolveLocalPublicWebhookBase,
} from "../lib/local-integration.mjs";
import { resolveValueorEnv, VALUEOR_ENV_LOCAL } from "../lib/env-mode.mjs";
import { getListeningPids } from "./spawn-utils.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function probeLocalApi(port = LOCAL_API_PORT) {
  const pids = getListeningPids(port);
  return pids.length > 0;
}

async function probeReadyz(port = LOCAL_API_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/readyz`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json().catch(() => ({}));
    return { ok: body?.status === "ready" || res.status === 200, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function main() {
  const mode = resolveValueorEnv(process.env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_LOCAL) {
    fail(
      [
        "dev:tunnel requires VALUEOR_ENV=local.",
        "Do not run this against production. Use your local stack (pnpm dev:api:local).",
      ].join("\n"),
    );
  }

  const integrationPath = resolve(projectRoot, LOCAL_INTEGRATION_ENV_FILE);
  if (!existsSync(integrationPath)) {
    fail(
      [
        `Missing ${LOCAL_INTEGRATION_ENV_FILE}.`,
        "",
        "One-time setup:",
        "  1. Copy .env.local.integration.example → .env.local.integration",
        "  2. Copy infra/cloudflare/local-developer.template.yml → infra/cloudflare/config.<you>.yml",
        "  3. Create your own Cloudflare named tunnel + DNS hostname (NOT webhook.valueor.org)",
        "  4. Fill CLOUDFLARE_TUNNEL_* and PUBLIC_WEBHOOK_BASE_URL",
        "",
        "See docs/operations/local-integration-tunnel.md",
      ].join("\n"),
    );
  }

  const integration = readLocalIntegrationEnv(projectRoot);
  const env = {
    VALUEOR_ENV: "local",
    ...integration,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string" && v.trim()),
    ),
  };

  let safety;
  try {
    safety = assertLocalDeveloperTunnelSafety({
      projectRoot,
      env,
      requireConfig: true,
    });
  } catch (error) {
    fail(error.message);
  }

  if (!probeLocalApi(LOCAL_API_PORT)) {
    fail(
      [
        `Local API is not listening on port ${LOCAL_API_PORT}.`,
        "Start it first:",
        "  pnpm dev:api:local",
        `Expected target: ${LOCAL_API_ORIGIN}`,
      ].join("\n"),
    );
  }

  const ready = await probeReadyz(LOCAL_API_PORT);
  if (!ready.ok) {
    console.warn(
      `Warning: /api/readyz on :${LOCAL_API_PORT} is not ready yet (${ready.error || ready.status}). Tunnel will still start; fix API if webhooks fail.`,
    );
  }

  const publicBase = resolveLocalPublicWebhookBase(env);
  if (!publicBase) {
    fail(
      [
        "PUBLIC_WEBHOOK_BASE_URL (or WEBHOOK_BASE_URL / VITE_WEBHOOK_BASE_URL) is unset.",
        "Set your developer-specific public tunnel origin in .env.local.integration.",
        "Do NOT use https://webhook.valueor.org.",
      ].join("\n"),
    );
  }

  const callbacks = buildWebhookCallbackUrls(publicBase);
  console.log("LOCAL developer tunnel");
  console.log(`  VALUEOR_ENV          = local`);
  console.log(`  API target           = ${LOCAL_API_ORIGIN}`);
  console.log(`  Tunnel config        = ${safety.configPath}`);
  console.log(`  Public webhook base  = ${publicBase}`);
  console.log(`  Instagram callback   = ${callbacks.instagram}`);
  console.log(`  WhatsApp callback    = ${callbacks.whatsapp}`);
  console.log(`  Messenger callback   = ${callbacks.messenger}`);
  console.log("");
  console.log("Outbound still blocked unless BOTH are set in .env.local.integration:");
  console.log("  LOCAL_INTEGRATION_ENABLED=true");
  console.log("  ALLOW_LOCAL_EXTERNAL_OUTBOUND=1");
  console.log("");
  console.log("Starting cloudflared (Ctrl+C to stop). Production tunnel is NOT used.");

  const configPath = safety.configPath;
  const configExists = existsSync(configPath);
  if (!configExists) {
    fail(`Tunnel config missing: ${configPath}`);
  }

  // Prefer config-file mode so production token in root .env cannot hijack this process.
  const args = ["tunnel", "--config", configPath, "run"];
  const child = spawn("cloudflared", args, {
    stdio: "inherit",
    shell: false,
    cwd: projectRoot,
    env: {
      ...process.env,
      VALUEOR_ENV: "local",
    },
  });

  child.on("error", (error) => {
    fail(
      [
        `Failed to start cloudflared: ${error.message}`,
        "Install cloudflared and run `cloudflared tunnel login` once per developer.",
      ].join("\n"),
    );
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
