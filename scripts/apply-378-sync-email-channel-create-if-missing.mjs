/**
 * Apply migration 378 (email channel create-if-missing + orphan catalog repair)
 * to the local database, then clear LOCAL_SANITIZED_DISABLED email passwords
 * so the UI stops pretending Gmail credentials are valid.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const migrationName = "378_sync_email_channel_create_if_missing.sql";
const version = "378";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const c = new pg.Client({ connectionString: env.DATABASE_URL || process.env.DATABASE_URL });
await c.connect();

const report = {
  migration: migrationName,
  applied: false,
  alreadyApplied: false,
  emailChannelsAfter: [],
  sanitizedCleared: 0,
};

try {
  await c.query("begin");

  const existing = await c.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rows.length > 0) {
    report.alreadyApplied = true;
  } else {
    await c.query(sql);
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
      [version, migrationName.replace(/\.sql$/, "")],
    );
    report.applied = true;
  }

  const cleared = await c.query(`
    update public.company_email_settings
    set smtp_password = '',
        smtp_password_hint = '',
        imap_password_hint = '',
        connection_status = 'needs_reauthorization',
        connection_last_error = 'Local import used sanitized credentials; re-enter a Gmail App Password',
        updated_at = now()
    where smtp_password = 'LOCAL_SANITIZED_DISABLED'
       or smtp_password_hint = 'LOCAL_SANITIZED_DISABLED'
    returning company_id
  `);
  report.sanitizedCleared = cleared.rowCount ?? 0;

  // Re-sync after credential clear so channel metadata reflects disconnected status.
  for (const row of cleared.rows) {
    await c.query(`select public.sync_email_channel_references($1::uuid)`, [row.company_id]);
  }

  const channels = await c.query(`
    select cc.id, cc.company_id, cc.display_name, cc.provider, ch.key,
           cc.configuration->>'fromEmail' as from_email,
           cc.configuration->>'credentialsSource' as cred_src,
           cc.configuration->>'connectionStatus' as connection_status
    from company_channels cc
    join communication_channels ch on ch.id = cc.channel_id
    where ch.key = 'email' and cc.deleted_at is null
    order by cc.company_id, cc.created_at
  `);
  report.emailChannelsAfter = channels.rows;

  await c.query("commit");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
