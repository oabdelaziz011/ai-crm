import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Canonical env file order — first file wins per key (matches project architecture). */
export const PROJECT_ENV_FILES = [
  ".env",
  "artifacts/login-app/.env.local",
  "artifacts/platform-worker/.env",
];

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  return env;
}

export function extractSupabaseProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Load env files into a map. Existing process.env values always win when hydrating.
 */
export function loadProjectEnv(projectRoot, options = {}) {
  const files = options.files ?? PROJECT_ENV_FILES;
  const hydrateProcessEnv = options.hydrateProcessEnv ?? false;
  const env = {};

  for (const relativePath of files) {
    const filePath = resolve(projectRoot, relativePath);
    const parsed = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (!value) continue;
      env[key] ??= value;
    }
  }

  const normalized = normalizeProjectEnv(env);

  if (options.mergeProcessEnv) {
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string" && value.trim()) {
        normalized[key] = value;
      }
    }
    return normalizeProjectEnv(normalized);
  }

  if (hydrateProcessEnv) {
    for (const [key, value] of Object.entries(normalized)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  return normalized;
}

/**
 * Apply cross-app aliases and dev defaults used by api-server and scripts.
 */
export function normalizeProjectEnv(env) {
  const out = { ...env };

  out.SUPABASE_URL ??= out.VITE_SUPABASE_URL;
  out.VITE_SUPABASE_URL ??= out.SUPABASE_URL;

  out.SUPABASE_PUBLISHABLE_KEY ??= out.VITE_SUPABASE_PUBLISHABLE_KEY;
  out.VITE_SUPABASE_PUBLISHABLE_KEY ??= out.SUPABASE_PUBLISHABLE_KEY;

  out.SUPABASE_ANON_KEY ??= out.SUPABASE_PUBLISHABLE_KEY;
  out.SUPABASE_SECRET_KEY ??= out.SUPABASE_SERVICE_ROLE_KEY;

  if (!out.DATABASE_URL?.trim() && out.SUPABASE_DB_PASSWORD?.trim()) {
    const projectRef =
      extractSupabaseProjectRef(out.SUPABASE_URL ?? out.VITE_SUPABASE_URL) ??
      out.SUPABASE_PROJECT_REF;
    const region = out.SUPABASE_REGION ?? "eu-north-1";
    if (projectRef) {
      const password = encodeURIComponent(out.SUPABASE_DB_PASSWORD.trim());
      out.DATABASE_URL = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    }
  }

  if (!out.SESSION_SECRET?.trim()) {
    out.SESSION_SECRET = "dev-secret-change-me";
  }

  if (!out.INTERNAL_API_KEY?.trim()) {
    out.INTERNAL_API_KEY = "dev-internal-api-key";
  }

  out.PORT ??= "3000";
  out.NODE_ENV ??= "development";

  return out;
}

export const API_SERVER_DEV_REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function validateApiServerEnv(env, options = {}) {
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const required =
    nodeEnv === "production"
      ? [...API_SERVER_DEV_REQUIRED, "SESSION_SECRET", "INTERNAL_API_KEY"]
      : [...API_SERVER_DEV_REQUIRED];

  const missing = required.filter((key) => !env[key]?.trim());

  return {
    ok: missing.length === 0,
    missing,
    nodeEnv,
  };
}

export function formatMissingEnvHelp(projectRoot, missing) {
  const ref =
    extractSupabaseProjectRef(
      loadProjectEnv(projectRoot, { hydrateProcessEnv: false }).SUPABASE_URL,
    ) ?? "YOUR_PROJECT_REF";

  const lines = [
    "Missing required environment variables for api-server:",
    ...missing.map((key) => `  - ${key}`),
    "",
    "VaultOS loads configuration from the repository root `.env` (see .env.example).",
    "On Replit these were injected as Secrets; on Windows you must create `.env` locally.",
    "",
  ];

  if (missing.includes("DATABASE_URL")) {
    lines.push(
      "Set DATABASE_URL to your Supabase Postgres connection string (Session pooler), e.g.:",
      `  https://supabase.com/dashboard/project/${ref}/settings/database`,
      "",
      "Alternatively set SUPABASE_DB_PASSWORD in `.env` and the loader will build DATABASE_URL.",
    );
  }

  if (missing.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    lines.push(
      "Set SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard → Project Settings → API → service_role.",
    );
  }

  lines.push("", "Run: node scripts/ensure-root-env.mjs");

  return lines.join("\n");
}
