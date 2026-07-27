/**
 * Apply migration 171 (platform AI provider).
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const evidenceDir = resolve(root, "docs/operations/evidence/platform-ai-provider");
mkdirSync(evidenceDir, { recursive: true });

async function main() {
  const env = loadSupabaseEnv(root);
  const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");

  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const projectRef = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
  const pooler = `postgresql://postgres.${projectRef}:${parsed.password}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`;
  const sql = readFileSync(resolve(root, "supabase/migrations/171_platform_ai_provider.sql"), "utf8");

  const client = new pg.Client({ connectionString: pooler, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows } = await client.query(`
    select to_regclass('public.platform_ai_providers') as table_ref
  `);
  if (rows[0]?.table_ref) {
    console.log("Migration 171 already applied — skipping.");
    await client.end();
    return;
  }

  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists")) {
      console.log("Migration 171 partially applied — continuing verification.");
    } else {
      throw error;
    }
  }
  const { rows: verify } = await client.query(`
    select count(*)::int as providers from public.platform_ai_providers
  `);
  await client.end();

  const report = { appliedAt: new Date().toISOString(), providers: verify[0]?.providers ?? 0 };
  writeFileSync(resolve(evidenceDir, "migration-report.json"), JSON.stringify(report, null, 2));
  console.log("Migration 171 applied.", report);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
