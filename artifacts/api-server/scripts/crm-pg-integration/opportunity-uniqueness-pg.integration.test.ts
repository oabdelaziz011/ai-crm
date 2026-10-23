/**
 * Customer+product uniqueness — disposable PostgreSQL integration (LOCAL ONLY).
 *
 * Exercises OpportunityCommandService + unique indexes against local Supabase PG.
 * Cleanup deletes ONLY tracked fixture ids.
 *
 * Run (from artifacts/api-server):
 *   node --import tsx/esm --test scripts/crm-pg-integration/opportunity-uniqueness-pg.integration.test.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  applyStoredProductInterestAfterQualify,
  createSupabaseOpportunityRepository,
  OpportunityCommandService,
  OPPORTUNITY_PERMISSIONS,
  type OpportunityEventPublisherPort,
} from "@workspace/opportunity-platform";
import {
  ACTOR_B,
  ASSISTANT_B,
  CO_A,
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

const here = dirname(fileURLToPath(import.meta.url));
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
let cleanupSummary: Record<string, number> = {};

function ctx(companyId = CO_B, userId = ACTOR_B) {
  return {
    userId,
    companyId,
    isSuperAdmin: true,
    hasPermission: (code: string) =>
      code === OPPORTUNITY_PERMISSIONS.create ||
      code === OPPORTUNITY_PERMISSIONS.convert ||
      code === OPPORTUNITY_PERMISSIONS.edit ||
      code === OPPORTUNITY_PERMISSIONS.view ||
      code === OPPORTUNITY_PERMISSIONS.delete,
  };
}

async function ensurePipelines(repos: ReturnType<typeof createSupabaseOpportunityRepository>) {
  await repos.ensureDefaultPipeline(CO_B);
  await repos.ensureDefaultPipeline(CO_A);
}

async function insertQualifiedLead(input: {
  companyId?: string;
  customerId: string | null;
  conversationId?: string | null;
  title?: string;
  email?: string | null;
}): Promise<string> {
  const companyId = input.companyId ?? CO_B;
  const id = randomUUID();
  const title = input.title ?? uniq("Lead");
  const { data: ensuredPipelineId, error: ensureErr } = await admin.rpc(
    "lead_platform_ensure_default_pipeline",
    { p_company_id: companyId },
  );
  if (ensureErr) throw new Error(`ensure lead pipeline failed: ${ensureErr.message}`);
  const pipe = await db.query(
    `select p.id as pipeline_id, s.id as stage_id
       from public.lead_pipelines p
       join public.lead_stages s on s.pipeline_id = p.id and s.company_id = p.company_id
      where p.company_id = $1
        and p.id = $2
        and p.deleted_at is null
        and s.deleted_at is null
      order by s.sort_order asc
      limit 1`,
    [companyId, String(ensuredPipelineId)],
  );
  assert.ok(pipe.rows[0]?.pipeline_id && pipe.rows[0]?.stage_id, "lead pipeline/stage required");
  await db.query(
    `insert into public.leads (
       id, company_id, customer_id, conversation_id, pipeline_id, stage_id,
       title, contact_name, email,
       lifecycle_status, is_qualified, qualified_at, created_by, updated_by, metadata
     ) values (
       $1, $2, $3, $4, $5, $6,
       $7, $7, $8,
       'qualified', true, now(), $9, $9, $10::jsonb
     )`,
    [
      id,
      companyId,
      input.customerId,
      input.conversationId ?? null,
      pipe.rows[0].pipeline_id,
      pipe.rows[0].stage_id,
      title,
      input.email ?? null,
      ACTOR_B,
      JSON.stringify({ crmPgTag: TAG }),
    ],
  );
  tracker.lead(id);
  return id;
}

async function countOpenScoped(customerId: string, productId: string): Promise<number> {
  const res = await db.query(
    `select count(*)::int as n from public.opportunities
      where company_id = $1
        and customer_id = $2
        and primary_product_id = $3
        and deleted_at is null
        and won_at is null
        and lost_at is null`,
    [CO_B, customerId, productId],
  );
  return res.rows[0].n as number;
}

describe("Opportunity uniqueness — customer + primary product (local PG)", () => {
  before(async () => {
    const clients = await createCrmPgClients();
    db = clients.db;
    admin = clients.admin;
    await snapshotConfigBaseline(db, tracker);

    // Ensure 430 uniqueness + 431 product-interest-per-product indexes (idempotent).
    for (const name of [
      "430_opportunity_lifecycle_demo_completed_primary_product.sql",
      "431_opportunity_product_interest_per_lead_product.sql",
    ]) {
      const sql = readFileSync(resolve(here, `../../../../supabase/migrations/${name}`), "utf8");
      await db.query(sql);
    }

    const idx = await db.query(`
      select
        exists(select 1 from pg_indexes where indexname = 'opportunities_one_open_per_customer_product_idx') as customer_product,
        exists(select 1 from pg_indexes where indexname = 'opportunities_one_open_product_interest_per_lead_idx') as legacy_lead,
        exists(select 1 from pg_indexes where indexname = 'opportunities_one_open_product_interest_per_lead_product_idx') as lead_product
    `);
    assert.equal(idx.rows[0].customer_product, true);
    assert.equal(idx.rows[0].legacy_lead, false);
    assert.equal(idx.rows[0].lead_product, true);
  });

  after(async () => {
    try {
      if (db) cleanupSummary = await cleanupTracked(db, tracker);
    } finally {
      await db?.end().catch(() => undefined);
      console.log(`[opp-uniqueness-pg] cleanup ${TAG}: ${JSON.stringify(cleanupSummary)}`);
    }
  });

  it("1) same customer + same product + different leads → one open opportunity", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u1", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Prod"), sku: uniq("sku") }, tracker);
    const lead1 = await insertQualifiedLead({ customerId, title: uniq("L1") });
    const lead2 = await insertQualifiedLead({ customerId, title: uniq("L2") });

    const a = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: lead1,
      primaryProductId: productId,
      name: uniq("Opp-A"),
    });
    tracker.opportunity(a.opportunity.id);

    const b = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: lead2,
      primaryProductId: productId,
      name: uniq("Opp-B"),
    });
    tracker.opportunity(b.opportunity.id);

    assert.equal(a.opportunity.id, b.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productId), 1);
  });

  it("2) same customer + different products → separate open opportunities", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u2", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productA = await createCatalogProduct(db, { companyId: CO_B, name: uniq("PA"), sku: uniq("sku") }, tracker);
    const productB = await createCatalogProduct(db, { companyId: CO_B, name: uniq("PB"), sku: uniq("sku") }, tracker);
    const leadId = await insertQualifiedLead({ customerId });

    const a = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId,
      primaryProductId: productA,
      name: uniq("Opp-A"),
      forceCreate: true,
    });
    const b = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId,
      primaryProductId: productB,
      name: uniq("Opp-B"),
      forceCreate: true,
    });
    tracker.opportunity(a.opportunity.id);
    tracker.opportunity(b.opportunity.id);

    assert.notEqual(a.opportunity.id, b.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productA), 1);
    assert.equal(await countOpenScoped(customerId, productB), 1);
  });

  it("3) after Won, same customer+product can create a new open opportunity", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u3", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Prod"), sku: uniq("sku") }, tracker);
    const leadId = await insertQualifiedLead({ customerId });

    const first = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId,
      primaryProductId: productId,
      name: uniq("Opp-1"),
    });
    tracker.opportunity(first.opportunity.id);

    // Terminal Won for uniqueness (stage matrix forbids qualification→won jump).
    await db.query(
      `update public.opportunities set won_at = now(), updated_at = now() where id = $1 and company_id = $2`,
      [first.opportunity.id, CO_B],
    );

    const lead2 = await insertQualifiedLead({ customerId, title: uniq("AfterWon") });
    const second = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: lead2,
      primaryProductId: productId,
      name: uniq("Opp-2"),
    });
    tracker.opportunity(second.opportunity.id);

    assert.notEqual(first.opportunity.id, second.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productId), 1);
  });

  it("4) after Lost (with reason), same customer+product can create a new open opportunity", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u4", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Prod"), sku: uniq("sku") }, tracker);
    const leadId = await insertQualifiedLead({ customerId });

    const first = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId,
      primaryProductId: productId,
      name: uniq("Opp-1"),
    });
    tracker.opportunity(first.opportunity.id);

    const stages = await repos.listStages(CO_B, first.opportunity.pipelineId);
    const lost = stages.find((s) => s.stageKey === "lost");
    assert.ok(lost, "lost stage required");
    await commands.changeStage(ctx(), {
      companyId: CO_B,
      opportunityId: first.opportunity.id,
      stageId: lost.id,
      lostReason: "Budget cut",
    });

    const lead2 = await insertQualifiedLead({ customerId, title: uniq("AfterLost") });
    const second = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: lead2,
      primaryProductId: productId,
      name: uniq("Opp-2"),
    });
    tracker.opportunity(second.opportunity.id);
    assert.notEqual(first.opportunity.id, second.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productId), 1);
  });

  it("5) soft-deleted matching opportunities do not block new creation", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u5", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Prod"), sku: uniq("sku") }, tracker);
    const leadId = await insertQualifiedLead({ customerId });

    const first = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId,
      primaryProductId: productId,
      name: uniq("Opp-1"),
    });
    tracker.opportunity(first.opportunity.id);
    await repos.softDeleteOpportunity(CO_B, first.opportunity.id, ACTOR_B);

    const lead2 = await insertQualifiedLead({ customerId, title: uniq("AfterDelete") });
    const second = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: lead2,
      primaryProductId: productId,
      name: uniq("Opp-2"),
    });
    tracker.opportunity(second.opportunity.id);
    assert.notEqual(first.opportunity.id, second.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productId), 1);
  });

  it("6) concurrent createFromLead for same customer+product converges to one open row", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u6", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Prod"), sku: uniq("sku") }, tracker);
    const lead1 = await insertQualifiedLead({ customerId, title: uniq("C1") });
    const lead2 = await insertQualifiedLead({ customerId, title: uniq("C2") });

    const [a, b] = await Promise.all([
      commands.createFromLead(ctx(), {
        companyId: CO_B,
        leadId: lead1,
        primaryProductId: productId,
        name: uniq("Opp-A"),
        forceCreate: true,
      }),
      commands.createFromLead(ctx(), {
        companyId: CO_B,
        leadId: lead2,
        primaryProductId: productId,
        name: uniq("Opp-B"),
        forceCreate: true,
      }),
    ]);
    tracker.opportunity(a.opportunity.id);
    tracker.opportunity(b.opportunity.id);

    assert.equal(a.opportunity.id, b.opportunity.id);
    assert.equal(await countOpenScoped(customerId, productId), 1);
  });

  it("7) missing customer identity is rejected; product-less general deal is allowed only with customer", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    await createAuthUser(db, "u7", tracker);
    // Lead without customer_id and without email — must not invent uniqueness scope or write.
    const leadId = await insertQualifiedLead({
      customerId: null,
      title: uniq("NoCust"),
      email: null,
    });

    await assert.rejects(
      () =>
        commands.createFromLead(ctx(), {
          companyId: CO_B,
          leadId,
          name: uniq("Opp-null-customer"),
          forceCreate: true,
        }),
      /customer identity is required/i,
    );

    const userId = await createAuthUser(db, "u7b", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const withCustomer = await insertQualifiedLead({
      customerId,
      title: uniq("HasCust"),
      email: null,
    });
    const general = await commands.createFromLead(ctx(), {
      companyId: CO_B,
      leadId: withCustomer,
      name: uniq("Opp-general"),
      forceCreate: true,
    });
    tracker.opportunity(general.opportunity.id);
    assert.equal(general.opportunity.customerId, customerId);
    assert.equal(general.opportunity.primaryProductId, null);
    assert.equal(general.opportunity.metadata.identityScope, "general_deal");
  });

  it("8) product-interest for one lead with two products creates separate opportunities", async () => {
    const userId = await createAuthUser(db, "u8", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const conversationId = await createConversation(
      db,
      {
        companyId: CO_B,
        customerId,
        channelType: "whatsapp",
        assistantId: ASSISTANT_B,
        metadata: { phone: uniquePhone() },
      },
      tracker,
    );
    const leadId = await insertQualifiedLead({ customerId, conversationId });
    const productA = await createCatalogProduct(db, { companyId: CO_B, name: uniq("IA"), sku: uniq("sku") }, tracker);
    const productB = await createCatalogProduct(db, { companyId: CO_B, name: uniq("IB"), sku: uniq("sku") }, tracker);

    await db.query(`update public.leads set metadata = $2::jsonb where id = $1`, [
      leadId,
      JSON.stringify({
        crmPgTag: TAG,
        productInterest: { productId: productA, productName: "IA" },
      }),
    ]);
    const first = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId });
    assert.equal(first.applied, true);

    await db.query(`update public.leads set metadata = $2::jsonb where id = $1`, [
      leadId,
      JSON.stringify({
        crmPgTag: TAG,
        productInterest: { productId: productB, productName: "IB" },
      }),
    ]);
    const second = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId });
    assert.equal(second.applied, true);

    const opps = await db.query(
      `select id, primary_product_id::text as product
         from public.opportunities
        where lead_id = $1 and deleted_at is null and won_at is null and lost_at is null
        order by created_at asc`,
      [leadId],
    );
    for (const row of opps.rows) tracker.opportunity(row.id);
    assert.equal(opps.rows.length, 2, "two products on one lead must yield two open opportunities");
    assert.deepEqual(
      new Set(opps.rows.map((r: { product: string }) => r.product)),
      new Set([productA, productB]),
    );
  });

  it("9) cross-company catalog product id is rejected", async () => {
    const repos = createSupabaseOpportunityRepository(admin);
    await ensurePipelines(repos);
    const commands = new OpportunityCommandService({ opportunities: repos, events: noopEvents });

    const userId = await createAuthUser(db, "u9", tracker);
    const customerId = await createCustomer(
      db,
      { companyId: CO_B, userId, name: uniq("Cust"), phone: uniquePhone(), email: `${uniq("c")}@example.test` },
      tracker,
    );
    const foreignProduct = await createCatalogProduct(
      db,
      { companyId: CO_A, name: uniq("Foreign"), sku: uniq("sku") },
      tracker,
    );
    const leadId = await insertQualifiedLead({ customerId });

    await assert.rejects(
      () =>
        commands.createFromLead(ctx(), {
          companyId: CO_B,
          leadId,
          primaryProductId: foreignProduct,
          name: uniq("Bad"),
        }),
      /active catalog product in this company/,
    );
    assert.equal(await countOpenScoped(customerId, foreignProduct), 0);
  });
});
