#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, readEnvFile } from "./env-utils.mjs";

const metaPath = path.join(PROJECT_ROOT, "infra/cloudflare/tunnel-meta.json");
const env = readEnvFile().values;

const base =
  env.get("VITE_WEBHOOK_BASE_URL")?.trim() ||
  env.get("WEBHOOK_BASE_URL")?.trim() ||
  (env.get("CLOUDFLARE_TUNNEL_HOSTNAME")?.trim()
    ? `https://${env.get("CLOUDFLARE_TUNNEL_HOSTNAME").trim()}`
    : "") ||
  env.get("VITE_API_SERVER_URL")?.trim() ||
  "";

if (!base) {
  console.error(
    "Webhook URL unknown. Set VITE_WEBHOOK_BASE_URL / WEBHOOK_BASE_URL or run pnpm tunnel:setup.",
  );
  process.exit(1);
}

const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/whatsapp`;
console.log(webhookUrl);

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  console.error(`\nTunnel: ${meta.tunnelName ?? meta.tunnelId} -> ${meta.hostname}`);
}
