/**
 * Apply ONLY migration 335 transactionally (campaign recipient delivery timestamps + index).
 * Does NOT use supabase db push. Does NOT apply other migrations.
 * Does NOT mutate customers, recipients, campaigns, queue, or Meta.
 * Does NOT touch live migration 334 (human_handoff_agent_role_template).
 *
 * Run: node scripts/apply-335-campaign-recipient-delivery-reconciliation.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "335_campaign_recipient_delivery_reconciliation.sql";
const version = "335";
const live334Name = "334_human_handoff_agent_role_template.sql";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const EXPECTED = {
  customers: 71,
  marketing_campaigns: 1,
  marketing_campaign_recipients: 1,
  notification_queue: 117,
  channel_delivery_events: 2415,
  whatsapp_delivery_logs: 1,
};

const TIMESTAMP_COLS = [
  "sent_at",
  "delivered_at",
  "read_at",
  "failed_at",
  "replied_at",
];

async function snapshot(client) {
  const counts = {};
  for (const t of Object.keys(EXPECTED)) {
    counts[t] = (
      await client.query(`select count(*)::int as n from public.${t}`)
    ).rows[0].n;
  }

  const customerFingerprint = (
    await client.query(
      `select md5(string_agg(
         id::text || '|' || coalesce(phone,'') || '|' || coalesce(phone_e164,'') || '|' ||
         coalesce(updated_at::text,''),
         E'\\n' order by id
       )) as fp
       from public.customers`,
    )
  ).rows[0].fp;

  const recipientFingerprint = (
    await client.query(
      `select md5(string_agg(
         id::text || '|' || coalesce(status,'') || '|' ||
         coalesce(provider_message_id,'') || '|' ||
         coalesce(notification_queue_id::text,'') || '|' ||
         coalesce(channel_delivery_event_id::text,'') || '|' ||
         coalesce(updated_at::text,''),
         E'\\n' order by id
       )) as fp
       from public.marketing_campaign_recipients`,
    )
  ).rows[0].fp;

  const recipientSample = (
    await client.query(
      `select id, status, provider_message_id, notification_queue_id,
              channel_delivery_event_id, updated_at
       from public.marketing_campaign_recipients
       order by id
       limit 5`,
    )
  ).rows;

  return { counts, customerFingerprint, recipientFingerprint, recipientSample };
}

async function schemaState(client) {
  const cols = (
    await client.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketing_campaign_recipients'
        and column_name in (
          'provider_message_id', 'sent_at', 'delivered_at',
          'read_at', 'failed_at', 'replied_at'
        )
      order by 1
    `)
  ).rows;

  const index = (
    await client.query(`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_marketing_campaign_recipients_company_provider_message'
    `)
  ).rows[0] ?? null;

  const statusCheck = (
    await client.query(`
      select pg_get_constraintdef(oid) as def
      from pg_constraint
      where conrelid = 'public.marketing_campaign_recipients'::regclass
        and conname = 'marketing_campaign_recipients_status_check'
    `)
  ).rows[0]?.def ?? null;

  const rls = (
    await client.query(`
      select relrowsecurity
      from pg_class
      where oid = 'public.marketing_campaign_recipients'::regclass
    `)
  ).rows[0];

  let nullLifecycle = null;
  const byName = Object.fromEntries(cols.map((r) => [r.column_name, r]));
  if (TIMESTAMP_COLS.every((c) => byName[c])) {
    nullLifecycle = (
      await client.query(`
        select
          count(*)::int as total,
          count(*) filter (where sent_at is not null)::int as sent_at_filled,
          count(*) filter (where delivered_at is not null)::int as delivered_at_filled,
          count(*) filter (where read_at is not null)::int as read_at_filled,
          count(*) filter (where failed_at is not null)::int as failed_at_filled,
          count(*) filter (where replied_at is not null)::int as replied_at_filled,
          count(*) filter (where provider_message_id is not null)::int as provider_message_id_filled
        from public.marketing_campaign_recipients
      `)
    ).rows[0];
  }

  return {
    columns: byName,
    index,
    statusCheck,
    rlsEnabled: rls?.relrowsecurity === true,
    nullLifecycle,
  };
}

async function migrationRows(client) {
  const r = await client.query(
    `select version, name from supabase_migrations.schema_migrations
     where version in ('334', '335')
     order by version`,
  );
  return Object.fromEntries(r.rows.map((row) => [row.version, row]));
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
  before: {},
  after: {},
  schemaBefore: null,
  schemaAfter: null,
  migrationsBefore: null,
  migrationsAfter: null,
  registered: false,
  skipped: false,
  customerDataChanged: null,
  recipientLifecycleChanged: null,
  countsMatchExpected: null,
  verdict: "GAP FOUND",
};

try {
  // Safety: migration must be DDL-only (no business DML).
  if (
    /\b(update|delete|insert\s+into)\s+public\.(customers|marketing_campaigns|marketing_campaign_recipients|notification_queue|channel_delivery_events|whatsapp_delivery_logs)\b/i.test(
      sql,
    )
  ) {
    throw new Error(
      "STOP: migration 335 appears to contain business-data DML",
    );
  }
  if (/disable row level security/i.test(sql)) {
    throw new Error("STOP: migration 335 must not disable RLS");
  }

  report.migrationsBefore = await migrationRows(client);
  const live334 = report.migrationsBefore["334"];
  if (!live334 || live334.name !== live334Name) {
    throw new Error(
      `Precondition failed: live migration 334 must remain '${live334Name}', got ${JSON.stringify(live334)}`,
    );
  }

  const expectedRegisteredName = "campaign_recipient_delivery_reconciliation";
  const existing = report.migrationsBefore["335"];
  if (existing) {
    report.existing = existing;
    report.after = await snapshot(client);
    report.schemaAfter = await schemaState(client);
    report.migrationsAfter = await migrationRows(client);
    const existingName = String(existing.name ?? "");
    const nameMatches =
      existingName === expectedRegisteredName ||
      existingName === migrationName ||
      existingName.includes("campaign_recipient_delivery_reconciliation");
    if (!nameMatches) {
      throw new Error(
        `STOP: version ${version} already registered as different migration: ${existingName}. ` +
          `Local file is ${migrationName}.`,
      );
    }
    report.skipped = true;
    for (const c of TIMESTAMP_COLS) {
      const col = report.schemaAfter.columns[c];
      if (!col || col.is_nullable !== "YES") {
        throw new Error(
          `STOP: version ${version} registered but column ${c} missing/not nullable`,
        );
      }
    }
    if (!report.schemaAfter.index) {
      throw new Error(
        `STOP: version ${version} registered but provider_message index missing`,
      );
    }
    if (report.migrationsAfter["334"]?.name !== live334Name) {
      throw new Error("STOP: migration 334 name changed unexpectedly");
    }
    report.ok = true;
    report.verdict = "SAFE FOR RECONCILIATION IMPLEMENTATION";
    writeFileSync(
      resolve(root, "scripts/_tmp-335-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  report.schemaBefore = await schemaState(client);
  if (TIMESTAMP_COLS.some((c) => report.schemaBefore.columns[c])) {
    throw new Error(
      "Precondition failed: lifecycle timestamps already present but migration 335 not registered",
    );
  }
  if (report.schemaBefore.index) {
    throw new Error(
      "Precondition failed: provider index already present but migration 335 not registered",
    );
  }
  if (!report.schemaBefore.columns.provider_message_id) {
    throw new Error(
      "Precondition failed: provider_message_id missing (expected from migration 328)",
    );
  }
  if (report.schemaBefore.columns.provider_message_id.is_nullable !== "YES") {
    throw new Error("Precondition failed: provider_message_id must be nullable");
  }
  if (!report.schemaBefore.rlsEnabled) {
    throw new Error(
      "Precondition failed: marketing_campaign_recipients RLS not enabled",
    );
  }
  if (
    !report.schemaBefore.statusCheck ||
    !/pending/.test(report.schemaBefore.statusCheck) ||
    !/queued/.test(report.schemaBefore.statusCheck) ||
    !/sent/.test(report.schemaBefore.statusCheck) ||
    !/failed/.test(report.schemaBefore.statusCheck) ||
    !/skipped/.test(report.schemaBefore.statusCheck)
  ) {
    throw new Error(
      `Precondition failed: unexpected status check: ${report.schemaBefore.statusCheck}`,
    );
  }

  report.before = await snapshot(client);
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (report.before.counts[k] !== v) {
      throw new Error(
        `Precondition failed: expected ${k}=${v}, got ${report.before.counts[k]}`,
      );
    }
  }
  report.countsMatchExpected = true;

  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, expectedRegisteredName],
  );
  await client.query("commit");
  report.registered = true;

  report.after = await snapshot(client);
  report.schemaAfter = await schemaState(client);
  report.migrationsAfter = await migrationRows(client);

  report.migrationRow = report.migrationsAfter["335"] ?? null;

  report.customerDataChanged =
    report.before.customerFingerprint !== report.after.customerFingerprint;
  report.recipientLifecycleChanged =
    report.before.recipientFingerprint !== report.after.recipientFingerprint;

  if (report.customerDataChanged) {
    throw new Error("STOP: customer fingerprint changed after DDL apply");
  }
  if (report.recipientLifecycleChanged) {
    throw new Error(
      "STOP: recipient lifecycle fingerprint changed after DDL apply",
    );
  }
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (report.after.counts[k] !== v) {
      throw new Error(
        `STOP: count drift after apply: ${k} expected ${v} got ${report.after.counts[k]}`,
      );
    }
  }

  if (report.migrationsAfter["334"]?.name !== live334Name) {
    throw new Error(
      `STOP: migration 334 changed after apply: ${JSON.stringify(report.migrationsAfter["334"])}`,
    );
  }
  if (report.migrationsAfter["335"]?.name !== expectedRegisteredName) {
    throw new Error(
      `STOP: migration 335 not registered correctly: ${JSON.stringify(report.migrationsAfter["335"])}`,
    );
  }

  for (const c of TIMESTAMP_COLS) {
    const col = report.schemaAfter.columns[c];
    if (!col) throw new Error(`STOP: missing column ${c}`);
    if (col.data_type !== "timestamp with time zone") {
      throw new Error(`STOP: ${c} must be timestamptz, got ${col.data_type}`);
    }
    if (col.is_nullable !== "YES") {
      throw new Error(`STOP: ${c} must be nullable`);
    }
  }
  if (report.schemaAfter.columns.provider_message_id?.is_nullable !== "YES") {
    throw new Error("STOP: provider_message_id must remain nullable");
  }
  if (!report.schemaAfter.index) {
    throw new Error("STOP: company-scoped provider_message index missing");
  }
  if (/UNIQUE/i.test(report.schemaAfter.index.indexdef)) {
    throw new Error("STOP: provider_message index must not be UNIQUE");
  }
  if (report.schemaAfter.statusCheck !== report.schemaBefore.statusCheck) {
    throw new Error("STOP: status CHECK changed");
  }
  if (!report.schemaAfter.rlsEnabled) {
    throw new Error("STOP: RLS disabled after apply");
  }
  const nl = report.schemaAfter.nullLifecycle;
  if (
    !nl ||
    nl.sent_at_filled !== 0 ||
    nl.delivered_at_filled !== 0 ||
    nl.read_at_filled !== 0 ||
    nl.failed_at_filled !== 0 ||
    nl.replied_at_filled !== 0
  ) {
    throw new Error(
      `STOP: lifecycle timestamps unexpectedly filled: ${JSON.stringify(nl)}`,
    );
  }

  report.ok = true;
  report.verdict = "SAFE FOR RECONCILIATION IMPLEMENTATION";
  writeFileSync(
    resolve(root, "scripts/_tmp-335-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  report.ok = false;
  report.verdict = "GAP FOUND";
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync(
    resolve(root, "scripts/_tmp-335-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
