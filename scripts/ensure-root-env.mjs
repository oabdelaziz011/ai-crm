#!/usr/bin/env node
/**
 * Ensure repository root `.env` exists for production/hosted and optional provider keys.
 * For LOCAL development, prefer `node scripts/ensure-localstack-env.mjs` (does not overwrite `.env`).
 *
 * When VALUEOR_ENV=local, this script validates `.env.localstack` and exits without
 * copying production credentials from login-app/.env.local into root `.env`.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSupabaseProjectRef,
  formatMissingEnvHelp,
  loadProjectEnv,
  normalizeProjectEnv,
  validateApiServerEnv,
  resolveValueorEnv,
  VALUEOR_ENV_LOCAL,
} from "./lib/load-project-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(projectRoot, ".env");
const examplePath = resolve(projectRoot, ".env.example");
const mode = resolveValueorEnv(process.env.VALUEOR_ENV);

if (mode === VALUEOR_ENV_LOCAL) {
  console.log("VALUEOR_ENV=local — validating .env.localstack (root .env left untouched).");
  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, "scripts/ensure-localstack-env.mjs")],
    { cwd: projectRoot, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

function upsertEnvLines(existingContent, updates) {
  const lines = existingContent.length > 0 ? existingContent.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") continue;
    const serialized = `${key}=${value}`;
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      lines[index] = serialized;
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(serialized);
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function seedMissingFromLoginAppLocal(baseContent) {
  // Only fill *missing* keys — never overwrite production root values with Vite local.
  const localPath = resolve(projectRoot, "artifacts/login-app/.env.local");
  if (!existsSync(localPath)) return baseContent;

  const local = {};
  for (const line of readFileSync(localPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) local[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  const existing = {};
  for (const line of baseContent.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) existing[match[1]] = match[2];
  }

  const updates = {};
  const maybe = {
    SUPABASE_URL: local.SUPABASE_URL ?? local.VITE_SUPABASE_URL,
    VITE_SUPABASE_URL: local.VITE_SUPABASE_URL ?? local.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: local.SUPABASE_PUBLISHABLE_KEY ?? local.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      local.VITE_SUPABASE_PUBLISHABLE_KEY ?? local.SUPABASE_PUBLISHABLE_KEY,
    VITE_API_SERVER_URL: local.VITE_API_SERVER_URL,
  };
  for (const [key, value] of Object.entries(maybe)) {
    if (!value) continue;
    if (existing[key]?.trim()) continue;
    updates[key] = value;
  }
  if (!existing.PORT?.trim()) updates.PORT = "3000";
  if (!existing.NODE_ENV?.trim()) updates.NODE_ENV = "development";
  if (!existing.SESSION_SECRET?.trim()) updates.SESSION_SECRET = "dev-secret-change-me";
  if (!existing.INTERNAL_API_KEY?.trim()) updates.INTERNAL_API_KEY = "dev-internal-api-key";

  const ref = extractSupabaseProjectRef(updates.VITE_SUPABASE_URL ?? updates.SUPABASE_URL);
  if (ref && !existing.SUPABASE_PROJECT_REF?.trim()) {
    updates.SUPABASE_PROJECT_REF = ref;
  }

  return upsertEnvLines(baseContent, updates);
}

if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) {
    console.error("Missing .env and .env.example — cannot bootstrap environment.");
    process.exit(1);
  }

  copyFileSync(examplePath, envPath);
  console.log(`Created ${envPath} from .env.example`);
}

let content = readFileSync(envPath, "utf8");
content = seedMissingFromLoginAppLocal(content);
writeFileSync(envPath, content, "utf8");

process.env.VALUEOR_ENV = mode;
const env = normalizeProjectEnv(loadProjectEnv(projectRoot, { hydrateProcessEnv: false, assertSafety: false }));
const validation = validateApiServerEnv(env);

if (!validation.ok) {
  console.error(formatMissingEnvHelp(projectRoot, validation.missing));
  process.exit(1);
}

console.log(`Environment OK (${envPath}) VALUEOR_ENV=${mode}`);
