/**
 * Apply ONLY migration 352 (email mailbox provider architecture) transactionally.
 * Same pattern as apply-351 — avoids supabase db push when remote versions diverge.
 *
 * Additive only. Does not delete credentials or channels.
 *
 * Run: node scripts/apply-352-email-mailbox-provider-architecture.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve(process.cwd());
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "352_email_mailbox_provider_architecture.sql";
const version = "352";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

async function verifyObjects(client) {
  const cols = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_email_settings'
      and column_name in (
        'mailbox_provider',
        'connection_status',
        'connection_last_error',
        'connection_last_synced_at',
        'oauth_expires_at'
      )
    order by 1
  `);

  const fns = await client.query(`
    select n.nspname || '.' || p.proname as name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname in (
      'store_company_email_oauth_tokens',
      'update_company_email_connection_status',
      'get_company_email_settings_decrypted',
      'email_settings_row_to_public'
    )
    order by 1
  `);

  const hasMailboxProvider = cols.rows.some((r) => r.column_name === "mailbox_provider");

  const gmailSample = hasMailboxProvider
    ? await client.query(`
        select
          count(*)::int as total_email_settings,
          count(*) filter (where lower(coalesce(smtp_host,'')) like '%gmail.com%'
            or lower(coalesce(imap_host,'')) like '%gmail.com%'
            or mailbox_provider = 'gmail')::int as gmail_like_rows,
          count(*) filter (where mailbox_provider = 'microsoft_365')::int as microsoft_rows,
          count(*) filter (where mailbox_provider = 'imap_smtp')::int as imap_smtp_rows
        from public.company_email_settings
      `)
    : await client.query(`
        select
          count(*)::int as total_email_settings,
          count(*) filter (where lower(coalesce(smtp_host,'')) like '%gmail.com%'
            or lower(coalesce(imap_host,'')) like '%gmail.com%')::int as gmail_like_rows,
          0::int as microsoft_rows,
          0::int as imap_smtp_rows
        from public.company_email_settings
      `);

  let emailChannels = { email_channels: 0 };
  try {
    const channels = await client.query(`
      select count(*)::int as email_channels
      from public.company_channels
      where provider = 'email'
    `);
    emailChannels = channels.rows[0] ?? emailChannels;
  } catch {
    emailChannels = { email_channels: -1 };
  }

  return {
    columns: cols.rows.map((r) => r.column_name),
    functions: fns.rows.map((r) => r.name),
    emailSettings: gmailSample.rows[0] ?? null,
    emailChannels,
  };
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const report = {
  ok: false,
  migration: migrationName,
  sqlSha256: createHash("sha256").update(sql).digest("hex"),
  alreadyApplied: false,
  applied: false,
  registered: false,
  before: null,
  after: null,
  migrationRow: null,
  destructiveMarkers: {
    hasDropTable: /\bdrop\s+table\b/i.test(sql),
    hasDeleteFrom: /\bdelete\s+from\b/i.test(sql),
    hasTruncate: /\btruncate\b/i.test(sql),
  },
};

try {
  if (
    !sql.includes("mailbox_provider") ||
    !sql.includes("store_company_email_oauth_tokens") ||
    !sql.includes("Preserves existing Gmail")
  ) {
    throw new Error("STOP: migration file does not look like 352 email mailbox provider");
  }
  if (
    report.destructiveMarkers.hasDropTable ||
    report.destructiveMarkers.hasDeleteFrom ||
    report.destructiveMarkers.hasTruncate
  ) {
    throw new Error("STOP: migration appears destructive");
  }

  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.before = await verifyObjects(client);

  if (existing.rowCount > 0) {
    report.alreadyApplied = true;
    report.ok = true;
    report.migrationRow = existing.rows[0];
    report.after = report.before;
    writeFileSync(
      resolve(root, "scripts/_tmp-352-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // If columns already exist without version row, still run SQL (IF NOT EXISTS) and register.
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)
     on conflict (version) do nothing`,
    [version, "email_mailbox_provider_architecture"],
  );
  await client.query("commit");
  report.applied = true;
  report.registered = true;

  report.after = await verifyObjects(client);
  const registered = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  report.migrationRow = registered.rows[0] ?? null;

  const requiredCols = [
    "mailbox_provider",
    "connection_status",
    "connection_last_error",
    "connection_last_synced_at",
    "oauth_expires_at",
  ];
  for (const col of requiredCols) {
    if (!report.after.columns.includes(col)) {
      throw new Error(`STOP: missing column ${col}`);
    }
  }
  for (const fn of [
    "public.store_company_email_oauth_tokens",
    "public.update_company_email_connection_status",
  ]) {
    if (!report.after.functions.includes(fn)) {
      throw new Error(`STOP: missing function ${fn}`);
    }
  }

  // Gmail/channel counts must not go to zero if they existed before.
  const beforeTotal = report.before.emailSettings?.total_email_settings ?? 0;
  const afterTotal = report.after.emailSettings?.total_email_settings ?? 0;
  if (afterTotal < beforeTotal) {
    throw new Error("STOP: email settings row count decreased");
  }
  const beforeChannels = report.before.emailChannels?.email_channels ?? 0;
  const afterChannels = report.after.emailChannels?.email_channels ?? 0;
  if (afterChannels < beforeChannels) {
    throw new Error("STOP: email channel count decreased");
  }

  report.ok = true;
  writeFileSync(
    resolve(root, "scripts/_tmp-352-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-352-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
