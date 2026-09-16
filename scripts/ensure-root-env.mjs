#!/usr/bin/env node
/**
 * Ensure repository root `.env` exists and seed it from `.env.example` + login-app/.env.local.
 * Run automatically before dev stacks on Windows (Replit injected secrets instead).
 *
 * Injected process.env values (Replit, Cursor Cloud) are a valid source, take
 * precedence over `.env` files, and are not written back into `.env`.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSupabaseProjectRef,
  formatMissingEnvHelp,
  loadProjectEnv,
  validateApiServerEnv,
} from "./lib/load-project-env.mjs";

const thisFile = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(thisFile), "..");

/** Load options used by this bootstrap: files first, then process.env wins. */
export const ROOT_ENV_LOAD_OPTIONS = Object.freeze({
  hydrateProcessEnv: false,
  mergeProcessEnv: true,
});

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

function seedFromLoginAppLocal(projectRoot, baseContent) {
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

/**
 * Bootstrap root `.env` from the example template (and optional login-app local
 * seed) then validate API-server env. Injected process.env values count as
 * present and win over file values; they are not copied into `.env`.
 *
 * @returns {0 | 1} process exit code
 */
export function ensureRootEnv(projectRoot) {
  const envPath = resolve(projectRoot, ".env");
  const examplePath = resolve(projectRoot, ".env.example");

  if (!existsSync(envPath)) {
    if (!existsSync(examplePath)) {
      console.error("Missing .env and .env.example — cannot bootstrap environment.");
      return 1;
    }

    copyFileSync(examplePath, envPath);
    console.log(`Created ${envPath} from .env.example`);
  }

  let content = readFileSync(envPath, "utf8");
  content = seedFromLoginAppLocal(projectRoot, content);
  writeFileSync(envPath, content, "utf8");

  const env = loadProjectEnv(projectRoot, ROOT_ENV_LOAD_OPTIONS);
  const validation = validateApiServerEnv(env);

  if (!validation.ok) {
    console.error(formatMissingEnvHelp(projectRoot, validation.missing));
    return 1;
  }

  console.log(`Environment OK (${envPath})`);
  return 0;
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(thisFile) === resolve(entry);
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  process.exit(ensureRootEnv(defaultProjectRoot));
}
