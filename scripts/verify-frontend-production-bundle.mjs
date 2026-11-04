#!/usr/bin/env node
/**
 * Verifies a built login-app dist contains the production API and webhook hosts
 * and does not contain local/dev API hosts. Prints hostnames only.
 *
 *   node scripts/verify-frontend-production-bundle.mjs artifacts/login-app/dist/public
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "artifacts/login-app/dist/public");
const required = ["https://api.valueor.org", "https://webhook.valueor.org"];
const forbidden = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3011",
  "http://127.0.0.1:3011",
  ".fly.dev",
  "trycloudflare.com",
];

if (!existsSync(root)) {
  console.error(`Missing frontend dist: ${root}`);
  process.exit(2);
}

const assets = join(root, "assets");
const files = existsSync(assets)
  ? readdirSync(assets).filter((name) => name.endsWith(".js")).map((name) => join(assets, name))
  : [];
const indexHtml = join(root, "index.html");
const bodies = [
  ...(existsSync(indexHtml) ? [readFileSync(indexHtml, "utf8")] : []),
  ...files.map((file) => readFileSync(file, "utf8")),
];
const blob = bodies.join("\n");

const missing = required.filter((value) => !blob.includes(value));
const presentForbidden = forbidden.filter((value) => blob.includes(value));

if (missing.length || presentForbidden.length) {
  console.error("Frontend production bundle verification failed.");
  for (const value of missing) console.error(`  missing ${value}`);
  for (const value of presentForbidden) console.error(`  forbidden ${value}`);
  process.exit(1);
}

console.log("Frontend production bundle verification passed.");
for (const value of required) console.log(`  present ${value}`);
