/**
 * Apply ONLY migration 365 (Email Identity permissions + storage).
 * Creates catalog codes. Does NOT grant them to production roles.
 *
 * Run: node scripts/apply-365-email-identity-rbac.mjs
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

const migrationName = "365_email_identity_rbac.sql";
const version = "365";
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

  const upsertSig = await client.query(
    `select n.nspname as schema, pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'upsert_company_email_settings'
     order by n.nspname`,
  );
  const internalUpsert = upsertSig.rows.find((row) => row.schema === "internal");
  if (!internalUpsert) {
    throw new Error("internal.upsert_company_email_settings missing");
  }
  const expected =
    "p_company_id uuid, p_enabled boolean, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_encryption text, p_from_email text, p_from_name text, p_max_retry_count integer, p_conversation_enabled boolean, p_inbound_provider text, p_outbound_provider text, p_imap_host text, p_imap_port integer, p_imap_username text, p_imap_password text, p_imap_encryption text, p_reply_to_email text, p_max_attachment_bytes bigint, p_imap_mailbox text, p_imap_poll_interval_seconds integer, p_oauth_provider text, p_oauth_token text";
  if (internalUpsert.args !== expected) {
    throw new Error(`Unexpected internal upsert signature: ${internalUpsert.args}`);
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

  const catalog = await client.query(
    `select code from public.permissions
     where code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')
     order by code`,
  );
  const grants = await client.query(
    `select p.code, count(*)::int as role_grants
     from public.permissions p
     left join public.role_permissions rp on rp.permission_id = p.id
     where p.code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')
     group by p.code
     order by p.code`,
  );
  const column = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_identity'`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        checksum,
        catalog: catalog.rows.map((row) => row.code),
        grants: grants.rows,
        emailIdentityColumn: column.rows.length === 1,
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
