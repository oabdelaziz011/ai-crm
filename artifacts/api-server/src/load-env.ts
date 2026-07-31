import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const PROJECT_ENV_FILES = [
  ".env",
  "artifacts/login-app/.env.local",
  "artifacts/platform-worker/.env",
] as const;

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
  process.env.SUPABASE_URL ??= process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL ??= process.env.SUPABASE_URL;

  process.env.SUPABASE_PUBLISHABLE_KEY ??= process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= process.env.SUPABASE_PUBLISHABLE_KEY;

  process.env.SUPABASE_ANON_KEY ??= process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!process.env.DATABASE_URL?.trim() && process.env.SUPABASE_DB_PASSWORD?.trim()) {
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

  if (!process.env.INTERNAL_API_KEY?.trim()) {
    process.env.INTERNAL_API_KEY = "dev-internal-api-key";
  }
}

const repoRoot = findMonorepoRoot(dirname(fileURLToPath(import.meta.url)));

for (const relativePath of PROJECT_ENV_FILES) {
  const path = resolve(repoRoot, relativePath);
  if (existsSync(path)) {
    loadDotenv({ path, override: false });
  }
}

applyEnvAliases();
