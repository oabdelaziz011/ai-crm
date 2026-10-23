/**
 * Demo-led Opportunity module visibility — LOCAL PG only.
 * Hidden while Lead is demo_scheduled; visible after demo_completed (Kanban: Opportunity/فرصة).
 * Sync/list must not create Opportunities implicitly.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  LEAD_PERMISSIONS,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import {
  createSupabaseOpportunityRepository,
  OpportunityCommandService,
  OpportunityQueryService,
  OPPORTUNITY_PERMISSIONS,
  syncOpportunityStageFromLeadLifecycle,
  type OpportunityEventPublisherPort,
} from "@workspace/opportunity-platform";
import {
  ACTOR_B,
  ASSISTANT_B,
  CO_B,
  CrmFixtureTracker,
  TAG,
  assertLocalCrmPgTarget,
  cleanupTracked,
  createAuthUser,
  createCatalogProduct,
  createConversation,
  createCrmPgClients,
  createCustomer,
  loadLocalstackEnv,
  snapshotConfigBaseline,
  uniq,
  uniquePhone,
  type PgClient,
} from "./harness.js";

loadLocalstackEnv();
assertLocalCrmPgTarget();

const tracker = new CrmFixtureTracker();
const noopEvents: OpportunityEventPublisherPort = {
  async publishCreated() {},
  async publishStageChanged() {},
  async publishProbabilityChanged() {},
  async publishWon() {},
  async publishLost() {},
  async publishNegotiationStarted() {},
};

let db: PgClient;
let admin: SupabaseClient;
let services: ReturnType<typeof createLeadPlatformServices>;
let cleanupSummary: Record<string, number> = {};

function leadCtx(perms: Set<string>, userId = ACTOR_B): LeadServiceContext {
  return {
    userId,
    companyId: CO_B,
    isSuperAdmin: false,
    hasPermission: (code: string) => perms.has(code),
  };
}

const oppCtx = {
  userId: ACTOR_B,
  companyId: CO_B,
  isSuperAdmin: false,
  hasPermission: (code: string) =>
    code === OPPORTUNITY_PERMISSIONS.view ||
    code === OPPORTUNITY_PERMISSIONS.convert ||
    code === OPPORTUNITY_PERMISSIONS.create ||
    code === OPPORTUNITY_PERMISSIONS.edit,
};

describe("Demo Opportunity visibility — local PG", () => {
  before(async () => {
    const clients = await createCrmPgClients();
    db = clients.db;
    admin = clients.admin;
    await snapshotConfigBaseline(db, tracker);
    services = createLeadPlatformServices(admin);
    await admin.rpc("lead_platform_ensure_default_pipeline", { p_company_id: CO_B });
  });

  after(async () => {
    try {
      if (db) cleanupSummary = await cleanupTracked(db, tracker);
    } finally {
      await db?.end().catch(() => undefined);
      console.log(`[demo-opp-visibility-pg] cleanup ${TAG}: ${JSON.stringify(cleanupSummary)}`);
    }
  });

  it("hides demo-led opp while demo_scheduled; shows after demo_completed; no implicit create", async () => {
    const userId = await createAuthUser(db, "vis", tracker);
    void userId;
    const phone = uniquePhone();
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId: ACTOR_B, name: uniq("VisCust"), phone, email: `${uniq("v")}@example.test` },
      tracker,
    );
    const conversationId = await createConversation(
      db,
      { companyId: CO_B, customerId, channelType: "whatsapp", assistantId: ASSISTANT_B, metadata: { phone } },
      tracker,
    );

    const pipe = await db.query(
      `select p.id as pipeline_id,
              (select s.id from public.lead_stages s
                where s.pipeline_id = p.id and s.deleted_at is null
                  and s.lifecycle_status = 'demo_scheduled' limit 1) as demo_scheduled_stage_id,
              (select s.id from public.lead_stages s
                where s.pipeline_id = p.id and s.deleted_at is null
                  and s.lifecycle_status = 'demo_completed' limit 1) as demo_completed_stage_id
         from public.lead_pipelines p
        where p.company_id = $1 and p.deleted_at is null
        order by p.is_default desc nulls last
        limit 1`,
      [CO_B],
    );
    const pipelineId = String(pipe.rows[0].pipeline_id);
    const demoScheduledStageId = pipe.rows[0].demo_scheduled_stage_id
      ? String(pipe.rows[0].demo_scheduled_stage_id)
      : null;
    const demoCompletedStageId = pipe.rows[0].demo_completed_stage_id
      ? String(pipe.rows[0].demo_completed_stage_id)
      : null;
    assert.ok(demoScheduledStageId, "demo_scheduled stage required");
    assert.ok(demoCompletedStageId, "demo_completed (Opportunity/فرصة) stage required");

    const leadId = randomUUID();
    await db.query(
      `insert into public.leads (
         id, company_id, customer_id, conversation_id, pipeline_id, stage_id,
         title, contact_name, phone, email, lifecycle_status, is_qualified, qualified_at,
         created_by, updated_by, metadata
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$7,$8,$9,'demo_scheduled',true,now(),$10,$10,$11::jsonb
       )`,
      [
        leadId,
        CO_B,
        customerId,
        conversationId,
        pipelineId,
        demoScheduledStageId,
        uniq("VisLead"),
        phone,
        `${uniq("v")}@example.test`,
        ACTOR_B,
        JSON.stringify({ crmPgTag: TAG }),
      ],
    );
    tracker.lead(leadId);

    const productId = await createCatalogProduct(
      db,
      { companyId: CO_B, name: uniq("VisProd"), sku: uniq("sku") },
      tracker,
    );

    const repos = createSupabaseOpportunityRepository(admin);
    await repos.ensureDefaultPipeline(CO_B);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });
    const queries = new OpportunityQueryService({ opportunities: repos });

    // Explicit authorized create while still demo_scheduled (pre-existing linked opp).
    const created = await commands.createFromLead(oppCtx, {
      companyId: CO_B,
      leadId,
      primaryProductId: productId,
      name: uniq("VisOpp"),
    });
    tracker.opportunity(created.opportunity.id);

    const hiddenList = await queries.list(oppCtx, { companyId: CO_B, leadId, limit: 20, offset: 0 });
    assert.equal(hiddenList.total, 0, "must hide while Lead is demo_scheduled");
    assert.equal(hiddenList.items.length, 0);
    assert.equal(await queries.getById(oppCtx, CO_B, created.opportunity.id), null);

    // Manual / no-lead opportunity remains visible in the same tenant (separate product scope).
    const manualProductId = await createCatalogProduct(
      db,
      { companyId: CO_B, name: uniq("ManualProd"), sku: uniq("msku") },
      tracker,
    );
    const manual = await commands.createManual(oppCtx, {
      companyId: CO_B,
      name: uniq("ManualOpp"),
      customerId,
      primaryProductId: manualProductId,
      currency: "SAR",
    });
    tracker.opportunity(manual.opportunity.id);
    const withManual = await queries.list(oppCtx, {
      companyId: CO_B,
      query: manual.opportunity.name,
      limit: 20,
      offset: 0,
    });
    assert.ok(
      withManual.items.some((row) => row.id === manual.opportunity.id),
      "manual opp must stay visible",
    );

    // Move Lead into demo_completed (display: Opportunity / فرصة) via authoritative stage change.
    const editPerms = new Set([LEAD_PERMISSIONS.view, LEAD_PERMISSIONS.edit]);
    const moved = await services.commands.changeLeadStage(leadCtx(editPerms), {
      companyId: CO_B,
      leadId,
      stageId: demoCompletedStageId,
    });
    assert.equal(moved.lead.lifecycleStatus, "demo_completed");

    const visibleList = await queries.list(oppCtx, { companyId: CO_B, leadId, limit: 20, offset: 0 });
    assert.equal(visibleList.total, 1);
    assert.equal(visibleList.items[0]?.id, created.opportunity.id);
    assert.equal((await queries.getById(oppCtx, CO_B, created.opportunity.id))?.id, created.opportunity.id);

    // Sync again must not create a duplicate.
    const beforeCount = await db.query(
      `select count(*)::int n from public.opportunities where lead_id = $1 and deleted_at is null`,
      [leadId],
    );
    const sync = await syncOpportunityStageFromLeadLifecycle(
      { opportunities: repos, events: noopEvents },
      oppCtx,
      { companyId: CO_B, leadId, toLifecycleStatus: "demo_completed" },
    );
    assert.ok(
      sync.status === "synced" ||
        sync.status === "skipped_same_stage" ||
        sync.status === "skipped_transition_not_allowed",
      `unexpected sync status: ${sync.status}`,
    );
    const afterCount = await db.query(
      `select count(*)::int n from public.opportunities where lead_id = $1 and deleted_at is null`,
      [leadId],
    );
    assert.equal(afterCount.rows[0].n, beforeCount.rows[0].n);

    // Lead without opportunity: sync reports clearly, does not create.
    const orphanPhone = uniquePhone();
    const orphanCustomerId = await createCustomer(
      db,
      {
        companyId: CO_B,
        userId: ACTOR_B,
        name: uniq("OrphanCust"),
        phone: orphanPhone,
        email: `${uniq("o")}@example.test`,
      },
      tracker,
    );
    const orphanConversationId = await createConversation(
      db,
      {
        companyId: CO_B,
        customerId: orphanCustomerId,
        channelType: "whatsapp",
        assistantId: ASSISTANT_B,
        metadata: { phone: orphanPhone },
      },
      tracker,
    );
    const orphanLeadId = randomUUID();
    await db.query(
      `insert into public.leads (
         id, company_id, customer_id, conversation_id, pipeline_id, stage_id,
         title, contact_name, phone, email, lifecycle_status, is_qualified, qualified_at,
         created_by, updated_by, metadata
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$7,$8,$9,'demo_completed',true,now(),$10,$10,$11::jsonb
       )`,
      [
        orphanLeadId,
        CO_B,
        orphanCustomerId,
        orphanConversationId,
        pipelineId,
        demoCompletedStageId,
        uniq("OrphanLead"),
        orphanPhone,
        `${uniq("o")}@example.test`,
        ACTOR_B,
        JSON.stringify({ crmPgTag: TAG }),
      ],
    );
    tracker.lead(orphanLeadId);
    const noOpp = await syncOpportunityStageFromLeadLifecycle(
      { opportunities: repos, events: noopEvents },
      oppCtx,
      { companyId: CO_B, leadId: orphanLeadId, toLifecycleStatus: "demo_completed" },
    );
    assert.equal(noOpp.status, "skipped_no_opportunity");
    const orphanOppCount = await db.query(
      `select count(*)::int n from public.opportunities where lead_id = $1 and deleted_at is null`,
      [orphanLeadId],
    );
    assert.equal(orphanOppCount.rows[0].n, 0);
  });
});
