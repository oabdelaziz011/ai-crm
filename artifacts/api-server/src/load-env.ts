import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import {
  LOCAL_OPTIONAL_MERGE_KEYS,
  VALUEOR_ENV_LOCAL,
  assertLocalEnvironmentSafety,
  resolveValueorEnv,
} from "../../../scripts/lib/env-mode.mjs";

function findMonorepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
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

function extractSupabaseProjectRef(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function applyEnvAliases(): void {
  const mode = resolveValueorEnv(process.env.VALUEOR_ENV);
  process.env.VALUEOR_ENV = mode;

  process.env.SUPABASE_URL ??= process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL ??= process.env.SUPABASE_URL;

  process.env.SUPABASE_PUBLISHABLE_KEY ??= process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= process.env.SUPABASE_PUBLISHABLE_KEY;

  process.env.SUPABASE_ANON_KEY ??= process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (mode === VALUEOR_ENV_LOCAL) {
    if (!process.env.DATABASE_URL?.trim()) {
      process.env.DATABASE_URL =
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    }
    if (/supabase\.co|pooler\.supabase\.com/i.test(process.env.DATABASE_URL || "")) {
      throw new Error(
        [
          "LOCAL ENVIRONMENT SAFETY CHECK FAILED",
          "Offending configuration:",
          "  - DATABASE_URL (production Supabase pooler/cloud host)",
        ].join("\n"),
      );
    }
    process.env.VITE_API_SERVER_URL ??= "http://localhost:3000";
    process.env.VITE_APP_ORIGIN ??= "http://localhost:5173";
    process.env.FRONTEND_ORIGIN ??= "http://localhost:5173";
    process.env.LOGIN_APP_URL ??= "http://localhost:5173";
    process.env.NODE_ENV ??= "development";
    process.env.PORT ??= "3000";
    for (const key of [
      "WEBHOOK_BASE_URL",
      "VITE_WEBHOOK_BASE_URL",
      "PUBLIC_WEBHOOK_BASE_URL",
    ] as const) {
      if (process.env[key] && /webhook\.valueor\.org/i.test(process.env[key]!)) {
        delete process.env[key];
      }
    }
  } else if (
    !process.env.DATABASE_URL?.trim() &&
    process.env.SUPABASE_DB_PASSWORD?.trim()
  ) {
    const projectRef =
      extractSupabaseProjectRef(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) ??
      process.env.SUPABASE_PROJECT_REF;
    const region = process.env.SUPABASE_REGION ?? "eu-north-1";
    if (projectRef) {
      const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim());
      process.env.DATABASE_URL = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    }
  }

  if (!process.env.SESSION_SECRET?.trim()) {
    process.env.SESSION_SECRET = "dev-secret-change-me";
  }

  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  if (nodeEnv !== "production" && !process.env.INTERNAL_API_KEY?.trim()) {
    process.env.INTERNAL_API_KEY = "dev-internal-api-key";
  }
}

const repoRoot = findMonorepoRoot(dirname(fileURLToPath(import.meta.url)));
const mode = resolveValueorEnv(process.env.VALUEOR_ENV);
process.env.VALUEOR_ENV = mode;

if (mode === VALUEOR_ENV_LOCAL) {
  const localstackPath = resolve(repoRoot, ".env.localstack");
  if (existsSync(localstackPath)) {
    loadDotenv({ path: localstackPath, override: false });
  }
  const optional = new Set(LOCAL_OPTIONAL_MERGE_KEYS);
  const root = parseEnvFile(resolve(repoRoot, ".env"));
  for (const [key, value] of Object.entries(root)) {
    if (!value || !optional.has(key)) continue;
    process.env[key] ??= value;
  }
  const workerPath = resolve(repoRoot, "artifacts/platform-worker/.env");
  if (existsSync(workerPath)) {
    loadDotenv({ path: workerPath, override: false });
  }
} else {
  for (const relativePath of [".env", "artifacts/platform-worker/.env"] as const) {
    const path = resolve(repoRoot, relativePath);
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
    }
  }
}

applyEnvAliases();
assertLocalEnvironmentSafety(process.env as Record<string, string | undefined>);
