/**
 * Apply ONLY migration 359 (email as a marketing campaign channel).
 * Does NOT use supabase db push. Does NOT send campaigns or mutate recipients.
 *
 * Run: node scripts/apply-359-marketing-campaigns-email-channel.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "359_marketing_campaigns_email_channel.sql";
const version = "359";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rows.length > 0) {
    console.log(JSON.stringify({ ok: true, skipped: true, version, name: existing.rows[0].name }));
    await client.end();
    process.exit(0);
  }

  await client.query("begin");
  await client.query(sql);
  const checksum = createHash("sha256").update(sql).digest("hex");
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, migrationName.replace(/\.sql$/, "")],
  );
  await client.query("commit");

  const campaignsCheck = await client.query(
    `select pg_get_constraintdef(oid) as def
     from pg_constraint
     where conname = 'marketing_campaigns_channels_check'`,
  );
  const recipientsCheck = await client.query(
    `select pg_get_constraintdef(oid) as def
     from pg_constraint
     where conname = 'marketing_campaign_recipients_channel_check'`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        checksum,
        campaignsCheck: campaignsCheck.rows[0]?.def ?? null,
        recipientsCheck: recipientsCheck.rows[0]?.def ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
