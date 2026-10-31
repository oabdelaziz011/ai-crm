#!/usr/bin/env node
/**
 * Proves migration 441 on the isolated local database only.
 * Refuses any Production URL. Does not apply the migration; run it with the CLI first.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const localUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (isProductionDatabaseUrl(localUrl)) {
  console.error("Refusing to run privilege proof against Production.");
  process.exit(2);
}

const migrationPath = resolve("supabase/migrations/441_revoke_anon_authenticated_excess_privileges.sql");
const sql = readFileSync(migrationPath, "utf8");
const client = new pg.Client({ connectionString: localUrl, connectionTimeoutMillis: 5000 });
await client.connect();

async function privilege(role, table, privilege) {
  const result = await client.query(
    "select has_table_privilege($1, $2, $3) as ok",
    [role, table, privilege],
  );
  return result.rows[0].ok;
}

const applied = await client.query(
  "select 1 from supabase_migrations.schema_migrations where version = '441'",
);
if (applied.rowCount !== 1) {
  console.error("Migration 441 is not recorded on the local database. Apply it with the local CLI first.");
  await client.end();
  process.exit(1);
}

await client.query("grant all privileges on table public.companies to anon, authenticated");
await client.query("grant all privileges on table public.plans to anon, authenticated");
await client.query(sql);

const checks = [
  ["anon", "public.companies", "truncate", false],
  ["authenticated", "public.companies", "truncate", false],
  ["authenticated", "public.companies", "select", true],
  ["service_role", "public.companies", "select", true],
  ["anon", "public.plans", "select", false],
  ["authenticated", "public.plans", "select", true],
  ["anon", "public.companies", "insert", false],
];

const failures = [];
for (const [role, table, name, expected] of checks) {
  const actual = await privilege(role, table, name);
  if (actual !== expected) {
    failures.push(`${role} ${name} on ${table}: expected ${expected}, got ${actual}`);
  }
}

await client.end();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Least-privilege proof passed on 127.0.0.1:54322.");