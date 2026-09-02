/**
 * Verify migration 335 file + live DB state.
 * READ-ONLY against the database — never applies the migration.
 * Also asserts live migration 334 (human_handoff) remains untouched.
 *
 * Run: node scripts/verify-335-campaign-recipient-delivery-reconciliation.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const migrationName = "335_campaign_recipient_delivery_reconciliation.sql";
const migrationPath = resolve(root, "supabase/migrations", migrationName);
const live334Name = "334_human_handoff_agent_role_template.sql";
const EXPECTED = {
  customers: 71,
  marketing_campaigns: 1,
  marketing_campaign_recipients: 1,
  notification_queue: 117,
  channel_delivery_events: 2415,
  whatsapp_delivery_logs: 1,
};

const report = {
  ok: false,
  verdict: "GAP FOUND",
  migrationFile: migrationName,
  fileChecks: {},
  live: null,
  counts: null,
  migrations: null,
  error: null,
};

function assertFile(name, cond, detail = null) {
  report.fileChecks[name] = { ok: Boolean(cond), detail };
  if (!cond) throw new Error(`FILE CHECK FAILED: ${name} ${detail ?? ""}`);
}

try {
  assertFile("migration_file_exists", existsSync(migrationPath), migrationPath);
  assertFile(
    "old_334_campaign_file_removed",
    !existsSync(
      resolve(
        root,
        "supabase/migrations/334_campaign_recipient_delivery_reconciliation.sql",
      ),
    ),
  );
  const sql = readFileSync(migrationPath, "utf8");

  assertFile("adds_sent_at", /add column if not exists sent_at timestamptz/i.test(sql));
  assertFile(
    "adds_delivered_at",
    /add column if not exists delivered_at timestamptz/i.test(sql),
  );
  assertFile("adds_read_at", /add column if not exists read_at timestamptz/i.test(sql));
  assertFile(
    "adds_failed_at",
    /add column if not exists failed_at timestamptz/i.test(sql),
  );
  assertFile(
    "adds_replied_at",
    /add column if not exists replied_at timestamptz/i.test(sql),
  );
  assertFile(
    "ensures_provider_message_id",
    /add column if not exists provider_message_id text/i.test(sql),
  );
  assertFile(
    "company_scoped_provider_index",
    /idx_marketing_campaign_recipients_company_provider_message/i.test(sql) &&
      /company_id,\s*provider_message_id/i.test(sql) &&
      /where provider_message_id is not null/i.test(sql),
  );
  assertFile(
    "no_global_provider_unique",
    !/unique\s+index[\s\S]*provider_message_id/i.test(sql) &&
      !/unique\s*\(\s*provider_message_id\s*\)/i.test(sql),
  );
  assertFile(
    "does_not_change_status_check",
    !/drop constraint if exists marketing_campaign_recipients_status_check/i.test(
      sql,
    ),
  );
  assertFile("no_recipient_dml", !/\b(update|delete)\s+public\.marketing_campaign_recipients\b/i.test(sql));
  assertFile("no_customer_dml", !/\b(update|delete|insert)\s+public\.customers\b/i.test(sql));
  assertFile("no_rls_weaken", !/disable row level security/i.test(sql));
  assertFile("no_db_push_comment", /DO NOT apply|without explicit approval/i.test(sql));

  const env = loadProjectEnv(root, { hydrateProcessEnv: false });
  if (!env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL missing");
  }

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const mig = await client.query(
      `select version, name from supabase_migrations.schema_migrations
       where version in ('334', '335')
       order by version`,
    );
    report.migrations = Object.fromEntries(
      mig.rows.map((r) => [r.version, r]),
    );
    if (report.migrations["334"]?.name !== live334Name) {
      throw new Error(
        `Live migration 334 must remain '${live334Name}', got ${JSON.stringify(report.migrations["334"])}`,
      );
    }

    const counts = {};
    for (const t of Object.keys(EXPECTED)) {
      counts[t] = (
        await client.query(`select count(*)::int as n from public.${t}`)
      ).rows[0].n;
    }
    report.counts = counts;
    for (const [k, v] of Object.entries(EXPECTED)) {
      if (counts[k] !== v) {
        throw new Error(`Count drift: ${k} expected ${v} got ${counts[k]}`);
      }
    }

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
    const byName = Object.fromEntries(cols.map((r) => [r.column_name, r]));

    const index = (
      await client.query(`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'idx_marketing_campaign_recipients_company_provider_message'
      `)
    ).rows[0];

    const statusCheck = (
      await client.query(`
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.marketing_campaign_recipients'::regclass
          and conname = 'marketing_campaign_recipients_status_check'
      `)
    ).rows[0]?.def;

    const rls = (
      await client.query(`
        select relrowsecurity
        from pg_class
        where oid = 'public.marketing_campaign_recipients'::regclass
      `)
    ).rows[0];

    const timestampCols = [
      "sent_at",
      "delivered_at",
      "read_at",
      "failed_at",
      "replied_at",
    ];
    const timestampsPresent = timestampCols.every((c) => Boolean(byName[c]));
    const providerPresent = Boolean(byName.provider_message_id);
    const registered335 = Boolean(report.migrations["335"]);

    let nullLifecycle = null;
    if (timestampsPresent) {
      nullLifecycle = (
        await client.query(`
          select
            count(*)::int as total,
            count(*) filter (where sent_at is not null)::int as sent_at_filled,
            count(*) filter (where delivered_at is not null)::int as delivered_at_filled,
            count(*) filter (where read_at is not null)::int as read_at_filled,
            count(*) filter (where failed_at is not null)::int as failed_at_filled,
            count(*) filter (where replied_at is not null)::int as replied_at_filled
          from public.marketing_campaign_recipients
        `)
      ).rows[0];
    }

    report.live = {
      applied: timestampsPresent && Boolean(index) && registered335,
      provider_message_id: byName.provider_message_id ?? null,
      timestamps: Object.fromEntries(
        timestampCols.map((c) => [c, byName[c] ?? null]),
      ),
      index: index ?? null,
      statusCheck: statusCheck ?? null,
      rlsEnabled: rls?.relrowsecurity === true,
      nullLifecycle,
      migration334Untouched: report.migrations["334"]?.name === live334Name,
      migration335: report.migrations["335"] ?? null,
    };

    if (!providerPresent) {
      throw new Error("Live DB missing provider_message_id (expected from migration 328)");
    }
    if (byName.provider_message_id.is_nullable !== "YES") {
      throw new Error("provider_message_id must remain nullable");
    }
    if (!statusCheck || !/pending/.test(statusCheck) || !/queued/.test(statusCheck)) {
      throw new Error(`Unexpected status check: ${statusCheck}`);
    }
    if (rls?.relrowsecurity !== true) {
      throw new Error("RLS must remain enabled on marketing_campaign_recipients");
    }

    if (!timestampsPresent) {
      if (registered335) {
        throw new Error("Migration 335 registered but lifecycle columns missing");
      }
      report.ok = true;
      report.verdict = "SAFE TO APPLY 335";
      report.note =
        "Migration file verified. Live DB does not yet have timestamp columns/index — not applied.";
    } else {
      for (const c of timestampCols) {
        if (byName[c].data_type !== "timestamp with time zone") {
          throw new Error(`${c} must be timestamptz, got ${byName[c].data_type}`);
        }
        if (byName[c].is_nullable !== "YES") {
          throw new Error(`${c} must be nullable`);
        }
      }
      if (!index) {
        throw new Error("Missing company-scoped provider_message index after apply");
      }
      if (!/company_id/i.test(index.indexdef) || !/provider_message_id/i.test(index.indexdef)) {
        throw new Error(`Unexpected index definition: ${index.indexdef}`);
      }
      if (/UNIQUE/i.test(index.indexdef)) {
        throw new Error("Provider message index must not be UNIQUE (global or otherwise)");
      }
      if (!registered335) {
        throw new Error("Lifecycle columns present but migration 335 not registered");
      }
      if (
        report.migrations["335"].name !== "campaign_recipient_delivery_reconciliation" &&
        !String(report.migrations["335"].name).includes(
          "campaign_recipient_delivery_reconciliation",
        )
      ) {
        throw new Error(
          `Unexpected migration 335 name: ${report.migrations["335"].name}`,
        );
      }
      report.ok = true;
      report.verdict = "SAFE FOR RECONCILIATION IMPLEMENTATION";
      report.note =
        "Migration 335 present on live DB and matches contract. Live 334 untouched.";
    }
  } finally {
    await client.end();
  }
} catch (error) {
  report.ok = false;
  report.verdict = "GAP FOUND";
  report.error = error instanceof Error ? error.message : String(error);
}

writeFileSync(
  resolve(root, "scripts/_tmp-335-verify-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
