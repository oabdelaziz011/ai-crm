/**
 * Demo-led journey — schedule → complete → human convert (LOCAL PG only).
 * Confirms no auto Opportunity on demo completion; convert requires opportunities.convert.
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
  applyStoredProductInterestAfterQualify,
  createSupabaseOpportunityRepository,
  OpportunityCommandService,
  OPPORTUNITY_PERMISSIONS,
  type OpportunityEventPublisherPort,
} from "@workspace/opportunity-platform";
import {
  advanceLeadToDemoScheduled,
  completeSalesDemo,
} from "../../src/services/sales-demo-crm-lifecycle.js";
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

describe("Demo-led journey — local PG", () => {
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
      console.log(`[demo-led-pg] cleanup ${TAG}: ${JSON.stringify(cleanupSummary)}`);
    }
  });

  it("schedule → complete demo → no auto opp → convert creates scoped opportunity", async () => {
    const userId = await createAuthUser(db, "demo", tracker);
    const phone = uniquePhone();
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("DemoCust"), phone, email: `${uniq("d")}@example.test` },
      tracker,
    );
    const conversationId = await createConversation(
      db,
      { companyId: CO_B, customerId, channelType: "whatsapp", assistantId: ASSISTANT_B, metadata: { phone } },
      tracker,
    );

    const pipe = await db.query(
      `select p.id as pipeline_id, s.id as stage_id
         from public.lead_pipelines p
         join public.lead_stages s on s.pipeline_id = p.id
        where p.company_id = $1 and p.deleted_at is null and s.deleted_at is null
        order by p.is_default desc nulls last, s.sort_order asc limit 1`,
      [CO_B],
    );
    const leadId = randomUUID();
    await db.query(
      `insert into public.leads (
         id, company_id, customer_id, conversation_id, pipeline_id, stage_id,
         title, contact_name, phone, email, lifecycle_status, is_qualified, qualified_at,
         created_by, updated_by, metadata
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$7,$8,$9,'qualified',true,now(),$10,$10,$11::jsonb
       )`,
      [
        leadId,
        CO_B,
        customerId,
        conversationId,
        pipe.rows[0].pipeline_id,
        pipe.rows[0].stage_id,
        uniq("DemoLead"),
        phone,
        `${uniq("d")}@example.test`,
        ACTOR_B,
        JSON.stringify({
          crmPgTag: TAG,
          productInterest: { productId: null },
        }),
      ],
    );
    tracker.lead(leadId);

    const productId = await createCatalogProduct(
      db,
      { companyId: CO_B, name: uniq("DemoProd"), sku: uniq("sku") },
      tracker,
    );
    await db.query(`update public.leads set metadata = $2::jsonb where id = $1`, [
      leadId,
      JSON.stringify({
        crmPgTag: TAG,
        productInterest: { productId, productName: "DemoProd" },
      }),
    ]);

    const editPerms = new Set([LEAD_PERMISSIONS.view, LEAD_PERMISSIONS.edit, LEAD_PERMISSIONS.qualify]);
    const { lead: scheduled } = await advanceLeadToDemoScheduled(
      services,
      leadCtx(editPerms),
      {
        id: leadId,
        lifecycleStatus: "qualified",
        pipelineId: String(pipe.rows[0].pipeline_id),
      },
    );
    assert.equal(scheduled.lifecycleStatus, "demo_scheduled");

    // Product-interest must not auto-create while demo-led.
    const blocked = await applyStoredProductInterestAfterQualify(admin, {
      companyId: CO_B,
      leadId,
    });
    assert.deepEqual(blocked, { applied: false, reason: "demo_led_awaits_human_convert" });
    const beforeComplete = await db.query(
      `select count(*)::int n from public.opportunities where lead_id = $1 and deleted_at is null`,
      [leadId],
    );
    assert.equal(beforeComplete.rows[0].n, 0);

    // Unauthorized complete (no leads.edit) — LeadCommandService checks permission.
    const noEdit = leadCtx(new Set([LEAD_PERMISSIONS.view]));
    await assert.rejects(
      () => completeSalesDemo(services, noEdit, { leadId }),
      /permission|Permission|denied|forbidden|not allowed|required/i,
    );

    const { lead: completed } = await completeSalesDemo(services, leadCtx(editPerms), { leadId });
    assert.equal(completed.lifecycleStatus, "demo_completed");

    const afterComplete = await db.query(
      `select count(*)::int n from public.opportunities where lead_id = $1 and deleted_at is null`,
      [leadId],
    );
    assert.equal(afterComplete.rows[0].n, 0, "Complete Demo must not create an Opportunity");

    // Unauthorized convert (no opportunities.convert).
    const repos = createSupabaseOpportunityRepository(admin);
    await repos.ensureDefaultPipeline(CO_B);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });
    await assert.rejects(
      () =>
        commands.createFromLead(
          {
            userId: ACTOR_B,
            companyId: CO_B,
            isSuperAdmin: false,
            hasPermission: (code) => code === OPPORTUNITY_PERMISSIONS.view,
          },
          { companyId: CO_B, leadId, primaryProductId: productId, name: uniq("ShouldFail") },
        ),
      /permission|Permission|denied|OPPORTUNITY_PERMISSION/i,
    );

    const converted = await commands.createFromLead(
      {
        userId: ACTOR_B,
        companyId: CO_B,
        isSuperAdmin: false,
        hasPermission: (code) =>
          code === OPPORTUNITY_PERMISSIONS.convert || code === OPPORTUNITY_PERMISSIONS.view,
      },
      {
        companyId: CO_B,
        leadId,
        primaryProductId: productId,
        name: uniq("DemoOpp"),
      },
    );
    tracker.opportunity(converted.opportunity.id);
    assert.equal(converted.opportunity.customerId, customerId);
    assert.equal(converted.opportunity.primaryProductId, productId);
    assert.equal(converted.opportunity.leadId, leadId);
  });
});
