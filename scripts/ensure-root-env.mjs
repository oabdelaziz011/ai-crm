#!/usr/bin/env node
/**
 * Ensure repository root `.env` exists and seed it from `.env.example` + login-app/.env.local.
 * Run automatically before dev stacks on Windows (Replit injected secrets instead).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSupabaseProjectRef,
  formatMissingEnvHelp,
  loadProjectEnv,
  normalizeProjectEnv,
  validateApiServerEnv,
} from "./lib/load-project-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(projectRoot, ".env");
const examplePath = resolve(projectRoot, ".env.example");

function upsertEnvLines(existingContent, updates) {
  const lines = existingContent.length > 0 ? existingContent.split(/\r?\n/) : [];
  const known = new Set();

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) known.add(match[1]);
  }

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
    known.add(key);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function seedFromLoginAppLocal(baseContent) {
  const localPath = resolve(projectRoot, "artifacts/login-app/.env.local");
  if (!existsSync(localPath)) return baseContent;

  const local = {};
  for (const line of readFileSync(localPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) local[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  const ref = extractSupabaseProjectRef(local.VITE_SUPABASE_URL ?? local.SUPABASE_URL);

  return upsertEnvLines(baseContent, {
    SUPABASE_URL: local.SUPABASE_URL ?? local.VITE_SUPABASE_URL,
    VITE_SUPABASE_URL: local.VITE_SUPABASE_URL ?? local.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: local.SUPABASE_PUBLISHABLE_KEY ?? local.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY:
      local.VITE_SUPABASE_PUBLISHABLE_KEY ?? local.SUPABASE_PUBLISHABLE_KEY,
    VITE_API_SERVER_URL: local.VITE_API_SERVER_URL,
    SUPABASE_PROJECT_REF: ref,
    PORT: "3000",
    NODE_ENV: "development",
    SESSION_SECRET: "dev-secret-change-me",
    INTERNAL_API_KEY: "dev-internal-api-key",
  });
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
content = seedFromLoginAppLocal(content);
writeFileSync(envPath, content, "utf8");

const env = normalizeProjectEnv(loadProjectEnv(projectRoot, { hydrateProcessEnv: false }));
const validation = validateApiServerEnv(env);

if (!validation.ok) {
  console.error(formatMissingEnvHelp(projectRoot, validation.missing));
  process.exit(1);
}

console.log(`Environment OK (${envPath})`);
