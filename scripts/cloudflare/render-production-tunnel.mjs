#!/usr/bin/env node
/**
 * Write a gitignored production tunnel config with a non-loopback origin.
 * Does not start cloudflared and does not change DNS.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderProductionTunnelConfig } from "./production-ingress.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sourcePath = resolve(root, "infra/cloudflare/config.yml");
const outputPath = resolve(root, "infra/cloudflare/config.production.local.yml");
const origin = process.env.PRODUCTION_API_ORIGIN;

try {
  const rendered = renderProductionTunnelConfig(readFileSync(sourcePath, "utf8"), origin);
  writeFileSync(outputPath, rendered, "utf8");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`Wrote ${outputPath}`);
console.log("Start it with CLOUDFLARE_TUNNEL_CONFIG set to that file after /api/readyz returns nodeEnv=production.");
