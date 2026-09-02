/**
 * Apply ONLY migration 342 transactionally (campaigns commercial feature catalog).
 * Does NOT use supabase db push. Does NOT apply other migrations.
 * Does NOT execute campaigns, process queues, send WhatsApp, call Meta,
 * mutate customers/recipients, or change subscriptions.
 *
 * Run: node scripts/apply-342-campaigns-commercial-feature.mjs
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

const migrationName = "342_campaigns_commercial_feature.sql";
const version = "342";
const expectedRegisteredName = "campaigns_commercial_feature";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const LIVE_340 = {
  version: "340",
  nameIncludes: "profiles_handoff_colleague_select",
};
const LIVE_341 = {
  version: "341",
  nameIncludes: "cvp_handoff_auto_routing",
};

const COUNT_TABLES = [
  "customers",
  "marketing_campaigns",
  "marketing_campaign_recipients",
  "notification_queue",
  "company_feature_overrides",
];

async function snapshot(client) {
  const counts = {};
  for (const t of COUNT_TABLES) {
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

  const campaignFingerprint = (
    await client.query(
      `select md5(coalesce(string_agg(
         id::text || '|' || coalesce(status,'') || '|' || coalesce(updated_at::text,''),
         E'\\n' order by id
       ), '')) as fp
       from public.marketing_campaigns`,
    )
  ).rows[0].fp;

  const recipientFingerprint = (
    await client.query(
      `select md5(coalesce(string_agg(
         id::text || '|' || coalesce(status,'') || '|' ||
         coalesce(provider_message_id,'') || '|' ||
         coalesce(notification_queue_id::text,'') || '|' ||
         coalesce(updated_at::text,''),
         E'\\n' order by id
       ), '')) as fp
       from public.marketing_campaign_recipients`,
    )
  ).rows[0].fp;

  const queueMax = (
    await client.query(
      `select coalesce(max(updated_at), max(created_at)) as m from public.notification_queue`,
    )
  ).rows[0].m;

  const campaignsOverrideCount = (
    await client.query(
      `select count(*)::int as n
       from public.company_feature_overrides
       where feature_code = 'campaigns'`,
    )
  ).rows[0].n;

  return {
    counts,
    customerFingerprint,
    campaignFingerprint,
    recipientFingerprint,
    queueMax: queueMax ? String(queueMax) : null,
    campaignsOverrideCount,
  };
}

async function catalogState(client) {
  const definition = (
    await client.query(
      `select code, category, label, default_enabled, is_billable,
              requires_subscription, is_active, sort_order
       from public.feature_definitions
       where code = 'campaigns'`,
    )
  ).rows[0] ?? null;

  const flag = (
    await client.query(
      `select feature_code, is_globally_enabled
       from public.feature_flags
       where feature_code = 'campaigns'`,
    )
  ).rows[0] ?? null;

  const mappings = (
    await client.query(
      `select permission_code
       from public.feature_definition_permissions
       where feature_code = 'campaigns'
       order by permission_code`,
    )
  ).rows.map((r) => r.permission_code);

  return { definition, flag, mappings };
}

async function migrationRow(client, ver) {
  const r = await client.query(
    `select version, name from supabase_migrations.schema_migrations
     where version = $1`,
    [ver],
  );
  return r.rows[0] ?? null;
}

async function migrationRows(client, versions) {
  const r = await client.query(
    `select version, name from supabase_migrations.schema_migrations
     where version = any($1::text[])
     order by version`,
    [versions],
  );
  return Object.fromEntries(r.rows.map((row) => [row.version, row]));
}

function assertLiveMigrationUnchanged(row, expected) {
  if (!row) {
    throw new Error(
      `STOP: live migration ${expected.version} missing — expected ${expected.nameIncludes}`,
    );
  }
  const name = String(row.name ?? "");
  if (!name.includes(expected.nameIncludes)) {
    throw new Error(
      `STOP: live migration ${expected.version} changed: expected name including "${expected.nameIncludes}", got "${name}"`,
    );
  }
}

function assertCatalogOk(catalog) {
  if (!catalog.definition) {
    throw new Error("STOP: feature_definitions.campaigns missing");
  }
  if (catalog.definition.is_billable !== true) {
    throw new Error("STOP: campaigns must be is_billable=true");
  }
  if (catalog.definition.requires_subscription !== true) {
    throw new Error("STOP: campaigns must be requires_subscription=true");
  }
  if (catalog.definition.default_enabled !== false) {
    throw new Error("STOP: campaigns must be default_enabled=false");
  }
  if (catalog.definition.is_active !== true) {
    throw new Error("STOP: campaigns must be is_active=true");
  }
  const expected = ["campaigns.create", "campaigns.send", "campaigns.view"];
  if (JSON.stringify(catalog.mappings) !== JSON.stringify(expected)) {
    throw new Error(
      `STOP: campaigns permission mappings mismatch: ${JSON.stringify(catalog.mappings)}`,
    );
  }
  if (!catalog.flag || catalog.flag.is_globally_enabled !== true) {
    throw new Error("STOP: campaigns feature_flags kill-switch row missing/disabled");
  }
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const report = {
  ok: false,
  migration: migrationName,
  version,
  sqlSha256: createHash("sha256").update(sql).digest("hex"),
  before: null,
  after: null,
  catalogBefore: null,
  catalogAfter: null,
  migrationsBefore: null,
  migrationsAfter: null,
  live340Before: null,
  live340After: null,
  live341Before: null,
  live341After: null,
  version342Available: null,
  registered: false,
  skipped: false,
  autoGrantCreated: null,
  dataUnchanged: null,
  metaCalls: 0,
  campaignExecution: false,
  queueProcessing: false,
  verdict: "GAP FOUND",
};

try {
  if (
    /\b(update|delete|insert\s+into)\s+public\.(customers|marketing_campaigns|marketing_campaign_recipients|notification_queue|channel_delivery_events|whatsapp_delivery_logs|company_subscriptions|company_feature_overrides)\b/i.test(
      sql,
    )
  ) {
    throw new Error(
      "STOP: migration 342 appears to contain business-data / grant / subscription DML",
    );
  }
  if (/disable row level security/i.test(sql)) {
    throw new Error("STOP: migration 342 must not disable RLS");
  }

  report.live340Before = await migrationRow(client, LIVE_340.version);
  report.live341Before = await migrationRow(client, LIVE_341.version);
  assertLiveMigrationUnchanged(report.live340Before, LIVE_340);
  assertLiveMigrationUnchanged(report.live341Before, LIVE_341);

  report.migrationsBefore = await migrationRows(client, [
    "340",
    "341",
    "342",
  ]);
  report.catalogBefore = await catalogState(client);
  report.before = await snapshot(client);

  const existing342 = report.migrationsBefore["342"];
  report.version342Available = !existing342;

  if (existing342) {
    report.existing342 = existing342;
    const existingName = String(existing342.name ?? "");
    const nameMatches =
      existingName === expectedRegisteredName ||
      existingName === migrationName ||
      existingName.includes("campaigns_commercial_feature");
    if (!nameMatches) {
      throw new Error(
        `STOP: version 342 already registered as different migration: ${existingName}`,
      );
    }
    report.catalogAfter = await catalogState(client);
    assertCatalogOk(report.catalogAfter);
    report.after = await snapshot(client);
    report.migrationsAfter = await migrationRows(client, ["340", "341", "342"]);
    report.live340After = await migrationRow(client, LIVE_340.version);
    report.live341After = await migrationRow(client, LIVE_341.version);
    assertLiveMigrationUnchanged(report.live340After, LIVE_340);
    assertLiveMigrationUnchanged(report.live341After, LIVE_341);
    report.skipped = true;
    report.autoGrantCreated =
      report.after.campaignsOverrideCount > report.before.campaignsOverrideCount;
    if (report.autoGrantCreated) {
      throw new Error("STOP: campaigns overrides increased unexpectedly on skip path");
    }
    report.dataUnchanged = true;
    report.ok = true;
    report.verdict = "SAFE FOR NEXT AUDIT";
    writeFileSync(
      resolve(root, "scripts/_tmp-342-apply-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (report.catalogBefore.definition) {
    throw new Error(
      "Precondition failed: campaigns already in feature_definitions but migration 342 not registered",
    );
  }
  if (report.before.campaignsOverrideCount !== 0) {
    throw new Error(
      `Precondition failed: unexpected pre-existing campaigns overrides=${report.before.campaignsOverrideCount}`,
    );
  }

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
  report.catalogAfter = await catalogState(client);
  report.migrationsAfter = await migrationRows(client, ["340", "341", "342"]);
  report.live340After = await migrationRow(client, LIVE_340.version);
  report.live341After = await migrationRow(client, LIVE_341.version);
  report.migrationRow = report.migrationsAfter[version] ?? null;

  assertLiveMigrationUnchanged(report.live340After, LIVE_340);
  assertLiveMigrationUnchanged(report.live341After, LIVE_341);
  assertCatalogOk(report.catalogAfter);

  if (report.migrationsAfter[version]?.name !== expectedRegisteredName) {
    throw new Error(
      `STOP: migration 342 not registered correctly: ${JSON.stringify(report.migrationsAfter[version])}`,
    );
  }

  report.autoGrantCreated =
    report.after.campaignsOverrideCount !== report.before.campaignsOverrideCount;
  if (report.after.campaignsOverrideCount !== 0) {
    throw new Error(
      `STOP: campaigns overrides present after apply (${report.after.campaignsOverrideCount}) — auto-grant forbidden`,
    );
  }

  for (const t of COUNT_TABLES) {
    if (report.before.counts[t] !== report.after.counts[t]) {
      throw new Error(
        `STOP: count drift on ${t}: before=${report.before.counts[t]} after=${report.after.counts[t]}`,
      );
    }
  }
  if (report.before.customerFingerprint !== report.after.customerFingerprint) {
    throw new Error("STOP: customer fingerprint changed");
  }
  if (report.before.campaignFingerprint !== report.after.campaignFingerprint) {
    throw new Error("STOP: marketing_campaigns fingerprint changed");
  }
  if (report.before.recipientFingerprint !== report.after.recipientFingerprint) {
    throw new Error("STOP: marketing_campaign_recipients fingerprint changed");
  }
  if (report.before.queueMax !== report.after.queueMax) {
    throw new Error(
      `STOP: notification_queue max timestamp changed (${report.before.queueMax} → ${report.after.queueMax})`,
    );
  }

  report.dataUnchanged = true;
  report.ok = true;
  report.verdict = "SAFE FOR NEXT AUDIT";
  writeFileSync(
    resolve(root, "scripts/_tmp-342-apply-report.json"),
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
    resolve(root, "scripts/_tmp-342-apply-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await client.end();
}
