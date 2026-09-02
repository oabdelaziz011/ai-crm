/**
 * READ-ONLY final audit for campaign WhatsApp delivery reconciliation.
 * Does NOT mutate data, process queue, execute campaigns, or call Meta.
 *
 * Run: node scripts/audit-campaign-delivery-reconciliation.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
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
  checks: {},
  counts: null,
  schema: null,
  wiring: {},
  error: null,
};

function check(name, cond, detail = null) {
  report.checks[name] = { ok: Boolean(cond), detail };
  if (!cond) throw new Error(`AUDIT FAIL: ${name} ${detail ?? ""}`);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

try {
  // --- Source wiring contracts ---
  const pure = read(
    "artifacts/login-app/src/lib/campaigns/campaign-delivery-reconciliation.ts",
  );
  const persist = read(
    "artifacts/login-app/src/lib/campaigns/reconcile-campaign-recipient-delivery.ts",
  );
  const provider = read(
    "artifacts/login-app/src/lib/notifications/providers/whatsapp/services/whatsapp-provider.ts",
  );
  const router = read("lib/channel-platform/src/router/channel-router.ts");
  const inbound = read(
    "lib/channel-platform/src/pipelines/inbound-message-pipeline.ts",
  );
  const webhook = read(
    "artifacts/api-server/src/platform/create-webhook-platform.ts",
  );
  const history = read(
    "artifacts/login-app/src/lib/campaigns/customer-campaign-history.ts",
  );
  const mig335 = resolve(
    root,
    "supabase/migrations/335_campaign_recipient_delivery_reconciliation.sql",
  );

  check("migration_335_file", existsSync(mig335));
  check(
    "send_reconcile_wired",
    /reconcileCampaignRecipientSendSuccess/.test(provider),
  );
  check(
    "delivery_webhook_wired",
    /reconcileDeliveryStatus/.test(router) &&
      /campaignDeliveryReconciler/.test(router),
  );
  check(
    "reply_attribution_wired",
    /reconcileQuotedReply/.test(inbound) &&
      /extractInteractiveReplyContextIdFromPayload/.test(inbound),
  );
  check(
    "webhook_platform_port",
    /createCampaignDeliveryReconcilePort/.test(webhook),
  );
  check(
    "company_scoped_lookups",
    /eq\("company_id"/.test(persist) &&
      /notification_queue_id/.test(persist) &&
      /provider_message_id/.test(persist),
  );
  check(
    "no_phone_attribution",
    !/slice\(-9\)|lastNine|\.eq\("phone"/.test(pure + persist + history),
  );
  check(
    "no_fake_conversations",
    !/createConversation/.test(pure + persist) &&
      !/from\("channel_delivery_events"\)\.insert/.test(persist),
  );
  check(
    "no_meta_queue_campaign_exec_in_reconcile",
    !/graph\.facebook|processPending|executeCampaign|processQueue/.test(
      pure + persist,
    ),
  );
  check(
    "history_uses_lifecycle_timestamps",
    /repliedAt/.test(history) && /mergeCustomerCampaignDeliveryEnrichment/.test(history),
  );
  check(
    "monotonic_helpers",
    /currentLifecycleRank|computeCampaignDeliveryStatusPatch/.test(pure),
  );

  report.wiring = {
    send: true,
    deliveryWebhook: true,
    reply: true,
    history: true,
  };

  const env = loadProjectEnv(root, { hydrateProcessEnv: false });
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const counts = {};
    for (const t of Object.keys(EXPECTED)) {
      counts[t] = (
        await client.query(`select count(*)::int as n from public.${t}`)
      ).rows[0].n;
      check(`count_${t}`, counts[t] === EXPECTED[t], `expected ${EXPECTED[t]} got ${counts[t]}`);
    }
    report.counts = counts;

    const mig = await client.query(
      `select version, name from supabase_migrations.schema_migrations
       where version in ('334','335') order by version`,
    );
    const byVer = Object.fromEntries(mig.rows.map((r) => [r.version, r.name]));
    check(
      "migration_334_untouched",
      byVer["334"] === "334_human_handoff_agent_role_template.sql",
      JSON.stringify(byVer["334"]),
    );
    check(
      "migration_335_registered",
      byVer["335"] === "campaign_recipient_delivery_reconciliation",
      JSON.stringify(byVer["335"]),
    );

    const cols = (
      await client.query(`
        select column_name, is_nullable
        from information_schema.columns
        where table_schema='public' and table_name='marketing_campaign_recipients'
          and column_name in (
            'provider_message_id','sent_at','delivered_at','read_at','failed_at','replied_at'
          )
      `)
    ).rows;
    const byName = Object.fromEntries(cols.map((r) => [r.column_name, r]));
    for (const c of [
      "provider_message_id",
      "sent_at",
      "delivered_at",
      "read_at",
      "failed_at",
      "replied_at",
    ]) {
      check(`col_${c}_nullable`, byName[c]?.is_nullable === "YES");
    }

    const statusCheck = (
      await client.query(`
        select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid='public.marketing_campaign_recipients'::regclass
          and conname='marketing_campaign_recipients_status_check'
      `)
    ).rows[0]?.def;
    check(
      "status_check_unchanged",
      /pending/.test(statusCheck) &&
        /queued/.test(statusCheck) &&
        /sent/.test(statusCheck) &&
        /failed/.test(statusCheck) &&
        /skipped/.test(statusCheck) &&
        !/delivered/.test(statusCheck),
      statusCheck,
    );

    const rls = (
      await client.query(
        `select relrowsecurity from pg_class where oid='public.marketing_campaign_recipients'::regclass`,
      )
    ).rows[0];
    check("rls_enabled", rls?.relrowsecurity === true);

    const lifecycle = (
      await client.query(`
        select
          count(*)::int as total,
          count(*) filter (where sent_at is not null)::int as sent_filled,
          count(*) filter (where delivered_at is not null)::int as delivered_filled,
          count(*) filter (where read_at is not null)::int as read_filled,
          count(*) filter (where failed_at is not null)::int as failed_filled,
          count(*) filter (where replied_at is not null)::int as replied_filled,
          count(*) filter (where provider_message_id is not null)::int as provider_filled
        from public.marketing_campaign_recipients
      `)
    ).rows[0];
    // No backfill during this phase — existing queued recipient stays empty.
    check(
      "no_lifecycle_backfill",
      lifecycle.sent_filled === 0 &&
        lifecycle.delivered_filled === 0 &&
        lifecycle.read_filled === 0 &&
        lifecycle.failed_filled === 0 &&
        lifecycle.replied_filled === 0 &&
        lifecycle.provider_filled === 0,
      JSON.stringify(lifecycle),
    );

    report.schema = { statusCheck, lifecycle, migrations: byVer };
  } finally {
    await client.end();
  }

  report.ok = true;
  report.verdict = "SAFE FOR PRODUCTION CAMPAIGN RECONCILIATION";
} catch (error) {
  report.ok = false;
  report.verdict = "GAP FOUND";
  report.error = error instanceof Error ? error.message : String(error);
}

writeFileSync(
  resolve(root, "scripts/_tmp-campaign-delivery-reconcile-audit.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
