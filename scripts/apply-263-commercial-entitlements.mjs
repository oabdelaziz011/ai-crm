import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const merged = loadProjectEnv(root);
const connectionString = merged.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error("DATABASE_URL missing — set DATABASE_URL or SUPABASE_DB_PASSWORD in .env");
}

const migrationName = "263_company_commercial_entitlements_foundation.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log(`Applying ${migrationName}...`);
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("OK — migration applied");

  const classification = await client.query(`
    select code, category, is_billable, requires_subscription, default_enabled,
           (is_billable or requires_subscription) as is_commercial
    from public.feature_definitions
    where is_active = true
    order by sort_order, code
  `);
  console.log("\nFeature classification:");
  for (const row of classification.rows) {
    console.log(
      `  ${row.code.padEnd(24)} commercial=${row.is_commercial} billable=${row.is_billable} requires_sub=${row.requires_subscription} default=${row.default_enabled}`,
    );
  }

  const backfill = await client.query(`
    select count(*)::int as n
    from public.company_feature_overrides
    where is_active = true
      and source = 'system'
      and reason = 'Phase 2 core compatibility backfill'
  `);
  console.log(`\nCore system backfill rows: ${backfill.rows[0].n}`);

  const coreCodes = await client.query(`
    select code from public.feature_definitions
    where is_active and not is_billable and not requires_subscription
    order by code
  `);
  console.log(
    `Core/non-commercial codes eligible for backfill: ${coreCodes.rows.map((r) => r.code).join(", ")}`,
  );

  const setting = await client.query(`
    select default_value from public.billing_setting_definitions where code = 'trial_feature_set'
  `);
  console.log(`trial_feature_set default: ${JSON.stringify(setting.rows[0]?.default_value)}`);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
