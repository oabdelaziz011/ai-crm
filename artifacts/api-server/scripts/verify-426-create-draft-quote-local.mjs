/**
 * Local-only live verification for create_draft_quote after migration 426.
 * Disposable fixtures only; cleans up. Refuses non-127.0.0.1:54322 / :54321.
 *
 * Run: node --import tsx/esm scripts/verify-426-create-draft-quote-local.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import {
  ToolRouterService,
  buildToolHandlers,
  createToolHandlerRegistry,
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  createSupabaseToolDefinitionRepository,
  createSupabaseToolExecutionRepository,
} from "@workspace/ai-tool-router";
import { ConversationAccessDeniedError } from "@workspace/ai-tool-router/src/errors.js";
import { createWebhookQuoteAgentPorts } from "../artifacts/api-server/src/platform/webhook-quote-agent-ports.ts";
import {
  resolveAvailableEmployeeTools,
  resolveRequiredFeatureCodesForTool,
  resolveCapabilityGroup,
} from "../artifacts/login-app/src/lib/ai-employees/utilities/ai-employee-capability-catalog.ts";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";
import { isProductionDatabaseUrl } from "./lib/env-mode.mjs";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_API = "http://127.0.0.1:54321";
const root = resolveProjectRoot(import.meta.url);
process.env.VALUEOR_ENV = "local";
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
const databaseUrl = (env.DATABASE_URL || process.env.DATABASE_URL || "").trim() || LOCAL_DB;
const supabaseUrl = (env.SUPABASE_URL || process.env.SUPABASE_URL || LOCAL_API).replace(/\/$/, "");
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";

if (isProductionDatabaseUrl(databaseUrl)) {
  throw new Error("Refusing verify against production DATABASE_URL.");
}
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error(`Refusing non-local host: ${parsed.hostname}`);
}
if (parsed.port !== "54322") {
  throw new Error(`Refusing non-local Postgres port: ${parsed.port || "(default)"}`);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321$/i.test(supabaseUrl)) {
  throw new Error(`Refusing non-local SUPABASE_URL: ${supabaseUrl}`);
}
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing for local verify");

const stamp = Date.now().toString(36);
const PREFIX = `m426_draft_${stamp}`;
const results = [];
function pass(name, detail) {
  results.push({ name, pass: true, detail: detail ?? null });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, err) {
  results.push({ name, pass: false, err: String(err?.message ?? err) });
  console.error(`FAIL ${name}:`, err?.message ?? err);
}

const pgClient = new pg.Client({ connectionString: databaseUrl });
await pgClient.connect();
const q = (sql, params = []) => pgClient.query(sql, params);

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = {
  companyA: null,
  companyB: null,
  userId: null,
  assistantId: null,
  leadPipelineId: null,
  leadStageId: null,
  oppPipelineId: null,
  oppStageId: null,
  productId: null,
  leadId: null,
  opportunityId: null,
  conversationId: null,
  quoteIds: [],
};

async function cleanup() {
  try {
    if (created.quoteIds.length) {
      await q(`delete from public.quote_line_items where quote_id = any($1::uuid[])`, [
        created.quoteIds,
      ]).catch(() => undefined);
      await q(`delete from public.quote_history where quote_id = any($1::uuid[])`, [
        created.quoteIds,
      ]).catch(() => undefined);
      await q(`delete from public.quotes where id = any($1::uuid[])`, [created.quoteIds]).catch(
        () => undefined,
      );
    }
    if (created.opportunityId) {
      await q(`delete from public.opportunity_line_items where opportunity_id = $1`, [
        created.opportunityId,
      ]).catch(() => undefined);
      await q(`delete from public.opportunity_history where opportunity_id = $1`, [
        created.opportunityId,
      ]).catch(() => undefined);
      await q(`delete from public.opportunities where id = $1`, [created.opportunityId]).catch(
        () => undefined,
      );
    }
    if (created.conversationId) {
      await q(`delete from public.tool_executions where conversation_id = $1`, [
        created.conversationId,
      ]).catch(() => undefined);
      await q(`delete from public.conversations where id = $1`, [created.conversationId]).catch(
        () => undefined,
      );
    }
    if (created.leadId) {
      await q(`delete from public.leads where id = $1`, [created.leadId]).catch(() => undefined);
    }
    if (created.productId) {
      await q(`delete from public.catalog_products where id = $1`, [created.productId]).catch(
        () => undefined,
      );
    }
    if (created.oppStageId) {
      await q(`delete from public.opportunity_stages where id = $1`, [created.oppStageId]).catch(
        () => undefined,
      );
    }
    if (created.oppPipelineId) {
      await q(`delete from public.opportunity_pipelines where id = $1`, [created.oppPipelineId]).catch(
        () => undefined,
      );
    }
    if (created.leadStageId) {
      await q(`delete from public.lead_stages where id = $1`, [created.leadStageId]).catch(
        () => undefined,
      );
    }
    if (created.leadPipelineId) {
      await q(`delete from public.lead_pipelines where id = $1`, [created.leadPipelineId]).catch(
        () => undefined,
      );
    }
    if (created.assistantId) {
      await q(`delete from public.ai_assistant_settings where id = $1`, [created.assistantId]).catch(
        () => undefined,
      );
    }
    if (created.userId) {
      await q(`delete from public.profiles where user_id = $1`, [created.userId]).catch(
        () => undefined,
      );
      try {
        await admin.auth.admin.deleteUser(created.userId);
      } catch {
        // best-effort
      }
    }
    for (const companyId of [created.companyA, created.companyB]) {
      if (!companyId) continue;
      await q(`delete from public.companies where id = $1 and name like $2`, [
        companyId,
        `${PREFIX}%`,
      ]).catch(() => undefined);
    }
  } catch (error) {
    console.warn("cleanup warning:", error?.message ?? error);
  }
}

/** Memory conversation reader that still enforces company scoping for tenant tests. */
function createScopedConversationReader(row) {
  return {
    async findById(id) {
      if (id !== row.id) return null;
      return {
        id: row.id,
        company_id: row.company_id,
        state: row.state,
        customer_id: null,
        metadata: {},
      };
    },
  };
}

try {
  // ── 1) Seed registration ───────────────────────────────────────────
  const seed = await q(
    `select key, category, is_enabled, required_permissions::text as perms, timeout_ms
     from public.tool_definitions where key = 'create_draft_quote'`,
  );
  assert.equal(seed.rowCount, 1);
  const perms = JSON.parse(seed.rows[0].perms);
  assert.deepEqual(perms.sort(), ["quotes.create", "tools.execute"].sort());
  assert.equal(seed.rows[0].category, "sales");
  assert.equal(seed.rows[0].is_enabled, true);
  pass("tool_definitions_row", seed.rows[0].perms);

  const hist = await q(
    `select version, name from supabase_migrations.schema_migrations where version = '426'`,
  );
  assert.equal(hist.rowCount, 1);
  pass("schema_migrations_426", hist.rows[0].name);

  const migrationPath = fileURLToPath(
    new URL("../supabase/migrations/426_ai_employee_create_draft_quote_tool.sql", import.meta.url),
  );
  await q(readFileSync(migrationPath, "utf8"));
  const afterReseed = await q(
    `select count(*)::int as n, max(required_permissions::text) as perms
     from public.tool_definitions where key = 'create_draft_quote'`,
  );
  assert.equal(afterReseed.rows[0].n, 1);
  assert.deepEqual(JSON.parse(afterReseed.rows[0].perms).sort(), [
    "quotes.create",
    "tools.execute",
  ].sort());
  pass("idempotent_reseed", "still 1 row; permissions unchanged");

  // ── 2) Wizard catalog source (LIVE DB rows → capability resolver) ───
  const catalogFromDb = (
    await q(
      `select key, display_name, category from public.tool_definitions
       where key in ('search_products','get_product_details','create_draft_quote')
       order by key`,
    )
  ).rows.map((row) => ({
    key: row.key,
    displayName: row.display_name,
    category: row.category,
  }));
  assert.ok(catalogFromDb.some((row) => row.key === CREATE_DRAFT_QUOTE_TOOL_KEY));
  assert.deepEqual(resolveRequiredFeatureCodesForTool(CREATE_DRAFT_QUOTE_TOOL_KEY), [
    "ai_employee",
    "opportunities",
  ]);
  assert.equal(resolveCapabilityGroup(CREATE_DRAFT_QUOTE_TOOL_KEY), "sales");
  const wizardTools = resolveAvailableEmployeeTools({
    enabledFeatureCodes: ["ai_employee", "opportunities"],
    catalogTools: catalogFromDb,
    webhookFacing: true,
  });
  assert.ok(wizardTools.some((tool) => tool.key === CREATE_DRAFT_QUOTE_TOOL_KEY));
  pass(
    "wizard_catalog_source",
    "LIVE tool_definitions → resolveAvailableEmployeeTools (API/catalog layer; not browser click E2E)",
  );

  // ── 3) Disposable fixtures ─────────────────────────────────────────
  await q(`select set_config('vault.provisioning_bootstrap', 'true', true)`);
  created.companyA = (
    await q(
      `insert into public.companies (
         name, status, subscription_plan, subscription_status, company_type,
         approval_status, approval_requested_at, tenant_provisioning_status, contact_email
       ) values ($1, 'Active', 'Pro', 'active', 'demo',
         'approved', now(), 'completed', $2)
       returning id`,
      [`${PREFIX}_A`, `${PREFIX}.a@valueor-test.local`],
    )
  ).rows[0].id;
  created.companyB = (
    await q(
      `insert into public.companies (
         name, status, subscription_plan, subscription_status, company_type,
         approval_status, approval_requested_at, tenant_provisioning_status, contact_email
       ) values ($1, 'Active', 'Pro', 'active', 'demo',
         'approved', now(), 'completed', $2)
       returning id`,
      [`${PREFIX}_B`, `${PREFIX}.b@valueor-test.local`],
    )
  ).rows[0].id;

  const email = `${PREFIX}@valueor-test.local`;
  const auth = await admin.auth.admin.createUser({
    email,
    password: `Tmp_${stamp}_Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: "M426 Draft Verify" },
  });
  if (auth.error || !auth.data.user) throw new Error(auth.error?.message || "auth create failed");
  created.userId = auth.data.user.id;
  await q(
    `insert into public.profiles (
       id, user_id, company_id, full_name, email, role, is_active, preferred_language, is_super_admin
     ) values ($1, $1, $2, $3, $4, 'admin', true, 'en', false)
     on conflict (id) do update set company_id = $2, email = excluded.email`,
    [created.userId, created.companyA, "M426 Draft Verify", email],
  );

  created.assistantId = (
    await q(
      `insert into public.ai_assistant_settings (company_id, assistant_name, is_enabled)
       values ($1, $2, true) returning id`,
      [created.companyA, `${PREFIX} Assistant`],
    )
  ).rows[0].id;

  created.leadPipelineId = (
    await q(
      `insert into public.lead_pipelines (company_id, name, slug, is_default, is_active)
       values ($1, $2, $3, true, true) returning id`,
      [created.companyA, `${PREFIX} Lead Pipe`, `m426-lead-${stamp}`],
    )
  ).rows[0].id;
  created.leadStageId = (
    await q(
      `insert into public.lead_stages (
         company_id, pipeline_id, name, slug, lifecycle_status, sort_order, probability_percent
       ) values ($1, $2, 'Qualified', 'qualified', 'qualified', 1, 50)
       returning id`,
      [created.companyA, created.leadPipelineId],
    )
  ).rows[0].id;

  created.oppPipelineId = (
    await q(
      `insert into public.opportunity_pipelines (company_id, name, slug, is_default, is_active)
       values ($1, $2, $3, true, true) returning id`,
      [created.companyA, `${PREFIX} Opp Pipe`, `m426-opp-${stamp}`],
    )
  ).rows[0].id;
  created.oppStageId = (
    await q(
      `insert into public.opportunity_stages (
         company_id, pipeline_id, name, slug, stage_key, sort_order, default_probability_percent, is_terminal
       ) values ($1, $2, 'Discovery', 'discovery', 'discovery', 1, 40, false)
       returning id`,
      [created.companyA, created.oppPipelineId],
    )
  ).rows[0].id;

  created.productId = randomUUID();
  await q(
    `insert into public.catalog_products (
       id, company_id, name, sku, product_type, base_price, currency, is_active, unit
     ) values ($1, $2, $3, $4, 'product', 250, 'EGP', true, 'each')`,
    [created.productId, created.companyA, `${PREFIX} Pack`, `SKU-${stamp}`],
  );

  created.leadId = randomUUID();
  await q(
    `insert into public.leads (
       id, company_id, title, contact_name, lifecycle_status, is_qualified, score,
       pipeline_id, stage_id, currency, metadata, created_by
     ) values (
       $1, $2, $3, 'Ada Draft', 'qualified', true, 80,
       $4, $5, 'EGP',
       jsonb_build_object(
         'productInterest', jsonb_build_object(
           'productId', $6::text,
           'productName', $7::text,
           'source', 'm426_verify',
           'at', now()
         )
       ),
       $8
     )`,
    [
      created.leadId,
      created.companyA,
      `${PREFIX} Lead`,
      created.leadPipelineId,
      created.leadStageId,
      created.productId,
      `${PREFIX} Pack`,
      created.userId,
    ],
  );

  created.opportunityId = randomUUID();
  await q(
    `insert into public.opportunities (
       id, company_id, lead_id, name, currency, country, market, language,
       primary_contact_name, probability_percent, probability_reason, probability_source,
       pipeline_id, stage_id, created_from_lead, owner_user_id, created_by
     ) values (
       $1, $2, $3, $4, 'EGP', 'EG', null, 'en',
       'Ada Draft', 40, 'm426_verify', 'manual',
       $5, $6, true, $7, $7
     )`,
    [
      created.opportunityId,
      created.companyA,
      created.leadId,
      `${PREFIX} Opp`,
      created.oppPipelineId,
      created.oppStageId,
      created.userId,
    ],
  );

  created.conversationId = randomUUID();
  await q(
    `insert into public.conversations (
       id, company_id, lead_id, ai_assistant_id, channel_type, state, created_by, conversation_number
     ) values ($1, $2, $3, $4, 'whatsapp', 'waiting_user', $5, 1)`,
    [
      created.conversationId,
      created.companyA,
      created.leadId,
      created.assistantId,
      created.userId,
    ],
  );
  pass("disposable_fixtures", `companyA=${created.companyA}`);

  // ── 4) ToolRouter: live definition repo + live quote ports + scoped reader ─
  const quotePorts = createWebhookQuoteAgentPorts(admin);
  const conversationRow = {
    id: created.conversationId,
    company_id: created.companyA,
    state: "waiting_user",
  };
  const router = new ToolRouterService(
    createSupabaseToolDefinitionRepository(admin),
    createSupabaseToolExecutionRepository(admin),
    createScopedConversationReader(conversationRow),
    createToolHandlerRegistry(buildToolHandlers({ quoteAgentPorts: quotePorts })),
  );

  const ctx = (permissions, companyId = created.companyA) => ({
    userId: created.userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) => permissions.includes(code),
  });

  const denied = await router.route(ctx(["tools.execute"]), {
    conversationId: created.conversationId,
    toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
    input: {},
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.errorCode, "PERMISSION_DENIED");
  pass("router_deny_missing_quotes_create", denied.errorCode);

  const deniedSend = await router.route(
    ctx(["tools.execute", "quotes.send", "quotes.approve", "quotes.delete"]),
    {
      conversationId: created.conversationId,
      toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
      input: {},
    },
  );
  assert.equal(deniedSend.status, "denied");
  pass("router_deny_send_approve_delete_insufficient");

  const createdResult = await router.route(ctx(["tools.execute", "quotes.create"]), {
    conversationId: created.conversationId,
    toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
    input: { title: `${PREFIX} Quote` },
  });
  assert.equal(createdResult.status, "succeeded", JSON.stringify(createdResult));
  const out1 = createdResult.output;
  assert.equal(out1.success, true);
  assert.equal(out1.draftOnly, true);
  assert.equal(out1.status, "draft");
  assert.equal(out1.sent, false);
  assert.equal(out1.approved, false);
  assert.equal(out1.created, true);
  assert.ok(out1.quoteId);
  created.quoteIds.push(out1.quoteId);

  const quoteRow = await q(
    `select id, company_id, status, opportunity_id, grand_total::float8 as grand_total, currency
     from public.quotes where id = $1`,
    [out1.quoteId],
  );
  assert.equal(quoteRow.rowCount, 1);
  assert.equal(quoteRow.rows[0].company_id, created.companyA);
  assert.equal(quoteRow.rows[0].status, "draft");
  assert.equal(quoteRow.rows[0].opportunity_id, created.opportunityId);
  assert.ok(Number(quoteRow.rows[0].grand_total) > 0);
  pass(
    "router_create_draft_live",
    `quote=${out1.quoteNumber} total=${quoteRow.rows[0].grand_total} ${quoteRow.rows[0].currency}`,
  );

  const reuse = await router.route(ctx(["tools.execute", "quotes.create"]), {
    conversationId: created.conversationId,
    toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
    input: {},
  });
  assert.equal(reuse.status, "succeeded");
  assert.equal(reuse.output.alreadyExists, true);
  assert.equal(reuse.output.created, false);
  assert.equal(reuse.output.quoteId, out1.quoteId);
  const quoteCount = await q(
    `select count(*)::int as n from public.quotes
     where company_id = $1 and opportunity_id = $2 and status = 'draft'`,
    [created.companyA, created.opportunityId],
  );
  assert.equal(quoteCount.rows[0].n, 1);
  pass("router_reuse_draft_live", `same quoteId=${reuse.output.quoteId}`);

  let tenantDenied = false;
  try {
    await router.route(ctx(["tools.execute", "quotes.create"], created.companyB), {
      conversationId: created.conversationId,
      toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
      input: {},
    });
  } catch (error) {
    tenantDenied = error instanceof ConversationAccessDeniedError || /CONVERSATION_ACCESS_DENIED/i.test(String(error?.code ?? error?.message));
    if (!tenantDenied) throw error;
  }
  assert.equal(tenantDenied, true);
  pass("router_tenant_isolation", "ConversationAccessDeniedError for company B");

  const bQuotes = await q(`select count(*)::int as n from public.quotes where company_id = $1`, [
    created.companyB,
  ]);
  assert.equal(bQuotes.rows[0].n, 0);
  pass("no_cross_company_quote_rows");
} catch (error) {
  fail("verify_aborted", error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  await pgClient.end();
  const failed = results.filter((row) => !row.pass);
  console.log(
    JSON.stringify(
      {
        kind: "local_live_verify",
        database: "127.0.0.1:54322",
        api: supabaseUrl,
        passed: results.filter((row) => row.pass).length,
        failed: failed.length,
        results,
        browserWizardE2E: false,
        note: "Wizard check used LIVE tool_definitions + capability resolver (not a UI click path).",
      },
      null,
      2,
    ),
  );
}
