/**
 * Apply Sprint Security-1 migrations (167–169) to live Supabase.
 * Run: node --import tsx/esm scripts/apply-security-migrations.mts
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const evidenceDir = resolve(root, "docs/operations/evidence/security-tenant-isolation");
mkdirSync(evidenceDir, { recursive: true });

const MIGRATIONS = [
  "167_crm_tenant_isolation.sql",
  "168_tenant_scoped_permissions.sql",
  "169_security_definer_and_billing_rls_hardening.sql",
  "170_crm_legacy_policy_purge.sql",
];

async function resolvePostgresConnectionStrings(databaseUrl: string): Promise<string[]> {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const host = parsed.hostname;
  const password = parsed.password;
  const projectRef = host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
  const region = "eu-north-1";
  const poolerSession = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  const poolerTxn = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
  return [...new Set([poolerSession, poolerTxn, databaseUrl])];
}

async function probeApplied(client: pg.Client) {
  const { rows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'company_id'
  `);
  const hasCompanyId = rows.length > 0;

  const { rows: policyRows } = await client.query(`
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and policyname = 'customers_tenant_select'
  `);

  return { hasCompanyId, hasTenantPolicy: policyRows.length > 0 };
}

async function applySql(connectionStrings: string[], sql: string, label: string) {
  let lastError: unknown;
  for (const connectionString of connectionStrings) {
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      return { applied: true, via: connectionString.includes("pooler") ? "pooler" : "direct", label };
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError ?? new Error(`Failed to apply ${label}`);
}

async function main() {
  const env = loadSupabaseEnv(root);
  const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing from .env");

  const connectionStrings = await resolvePostgresConnectionStrings(databaseUrl);
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), migrations: [] as unknown[] };

  const probeClient = new pg.Client({ connectionString: connectionStrings[0]!, ssl: { rejectUnauthorized: false } });
  await probeClient.connect();
  const probe = await probeApplied(probeClient);

  const { rows: legacyPolicies } = await probeClient.query(`
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'customers'
      and policyname in ('customers_all', 'customers_select', 'customers_owner_select')
  `);
  await probeClient.end();

  let migrationsToApply = [...MIGRATIONS];

  if (probe.hasCompanyId && probe.hasTenantPolicy && legacyPolicies.length === 0) {
    report.skipped = true;
    report.reason = "Security migrations already applied — no legacy permissive CRM policies";
    writeFileSync(resolve(evidenceDir, "migration-apply-report.json"), JSON.stringify(report, null, 2));
    console.log("Security migrations already applied — skipping.");
    return;
  }

  if (probe.hasCompanyId && probe.hasTenantPolicy && legacyPolicies.length > 0) {
    report.legacyPoliciesFound = legacyPolicies.map((r) => r.policyname);
    migrationsToApply = ["170_crm_legacy_policy_purge.sql"];
    console.log(`Legacy policies detected: ${report.legacyPoliciesFound.join(", ")} — applying 170 only.`);
  }

  for (const file of migrationsToApply) {
    const sql = readFileSync(resolve(root, "supabase/migrations", file), "utf8");
    console.log(`Applying ${file}...`);
    const result = await applySql(connectionStrings, sql, file);
    (report.migrations as unknown[]).push(result);
    console.log(`  OK (${result.via})`);
  }

  const verifyClient = new pg.Client({ connectionString: connectionStrings[0]!, ssl: { rejectUnauthorized: false } });
  await verifyClient.connect();
  report.verification = await probeApplied(verifyClient);

  const { rows: nullCompanyCustomers } = await verifyClient.query(`
    select count(*)::int as count from public.customers where company_id is null
  `);
  report.nullCompanyCustomers = nullCompanyCustomers[0]?.count ?? null;
  await verifyClient.end();

  report.completedAt = new Date().toISOString();
  writeFileSync(resolve(evidenceDir, "migration-apply-report.json"), JSON.stringify(report, null, 2));
  console.log("\nMigration apply report written to docs/operations/evidence/security-tenant-isolation/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
