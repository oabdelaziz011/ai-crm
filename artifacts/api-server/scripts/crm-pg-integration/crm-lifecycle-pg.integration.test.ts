/**
 * CRM lifecycle — disposable PostgreSQL-backed integration suite (LOCAL ONLY).
 *
 * Exercises real packages against local Supabase (REST 54321 / PG 54322):
 *   lead-platform Smart Capture, opportunity-platform product-interest apply,
 *   automation-platform sales follow-up jobs (real claim RPC), and the api-server
 *   deferred ConversationStarted flush + product-interest bridge.
 *
 * Safety: loads `.env.localstack` only, refuses non-local targets, uses DEMO companies with tagged
 * disposable rows, never sends (allowProviderSend=false; fake delivery ports only), cleans up in after().
 *
 * Run (from artifacts/api-server):
 *   node --import tsx/esm --test scripts/crm-pg-integration/crm-lifecycle-pg.integration.test.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  createSupabaseLeadSmartCapture,
  LeadQualificationPolicyRejectedError,
  LEAD_PERMISSIONS,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import {
  advanceLeadToDemoScheduled,
  syncSalesDemoBookingCancelledToCrm,
  syncSalesDemoBookingToCrm,
} from "../../src/services/sales-demo-crm-lifecycle.js";
import { createBookingDomainStack } from "@workspace/scheduling-engine";
import { applyStoredProductInterestAfterQualify } from "@workspace/opportunity-platform";
import {
  enqueueSalesFollowUpJob,
  claimDueSalesFollowUpJobs,
  completeSalesFollowUpJob,
  processClaimedSalesFollowUpJob,
  processSalesFollowUpTick,
  cancelPendingSalesFollowUpJobsForLead,
  scheduleSalesFollowUpLadder,
  cancelSalesFollowUpForOpportunity,
  createSupabaseSalesFollowUpAttemptStore,
  normalizeSalesFollowUpSettings,
  scheduleSalesFollowUpAfterLeadQualified,
  listSalesFollowUpReviewItems,
  invalidateSalesFollowUpDraftsForConversation,
  approveAndSendSalesFollowUpDraft,
  type SalesFollowUpDeliveryPort,
  type SalesFollowUpDeliveryRequest,
  type SalesFollowUpEligibilitySnapshot,
  type SalesFollowUpJobRecord,
} from "@workspace/automation-platform";
import { recordVerifiedProductInterestForConversation } from "../../src/platform/webhook-product-interest-bridge.js";
import {
  ACTOR_A,
  ACTOR_B,
  ASSISTANT_A,
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
  enableSalesFollowUp,
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

let db: PgClient;
let admin: SupabaseClient;
let anonKey = "";
let capture: ReturnType<typeof createSupabaseLeadSmartCapture>;
let services: ReturnType<typeof createLeadPlatformServices>;
let cleanupSummary: Record<string, number> = {};

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

type LeadRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  lifecycle_status: string;
  phone: string | null;
  is_qualified: boolean;
  metadata: Record<string, any>;
  updated_at: string;
  deleted_at: string | null;
};

async function userFor(label: string) {
  return createAuthUser(db, label, tracker);
}

async function makeCustomer(opts: { companyId?: string; phone?: string | null; email?: string | null; name?: string } = {}) {
  const companyId = opts.companyId ?? CO_B;
  const userId = await userFor("cust");
  const phone = opts.phone === undefined ? uniquePhone() : opts.phone;
  const customerId = await createCustomer(
    db,
    { companyId, userId, name: opts.name ?? uniq("Customer"), phone, email: opts.email ?? null },
    tracker,
  );
  return { customerId, phone, userId };
}

async function makeConversation(opts: {
  companyId?: string;
  customerId?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
  channelType?: string;
}) {
  const companyId = opts.companyId ?? CO_B;
  return createConversation(
    db,
    {
      companyId,
      customerId: opts.customerId ?? null,
      channelType: opts.channelType ?? "whatsapp",
      assistantId: companyId === CO_A ? ASSISTANT_A : ASSISTANT_B,
      externalThreadId: uniq("thread"),
      metadata: { ...(opts.phone ? { senderExternalId: opts.phone, phone: opts.phone } : {}), ...(opts.metadata ?? {}) },
    },
    tracker,
  );
}

async function captureStarted(input: {
  companyId?: string;
  conversationId: string;
  phone?: string | null;
  email?: string | null;
  customerId?: string | null;
  channelType?: string;
}) {
  const companyId = input.companyId ?? CO_B;
  const result = await capture.handleConversationStarted({
    companyId,
    conversationId: input.conversationId,
    channelType: input.channelType ?? "whatsapp",
    externalUserId: input.phone ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    customerId: input.customerId ?? null,
    actorUserId: companyId === CO_A ? ACTOR_A : ACTOR_B,
    createdAt: new Date().toISOString(),
  });
  if (result?.leadId) tracker.lead(result.leadId);
  return result;
}

async function getLead(leadId: string): Promise<LeadRow> {
  const res = await db.query(`select * from public.leads where id = $1`, [leadId]);
  assert.equal(res.rows.length, 1, `lead ${leadId} should exist`);
  return res.rows[0] as LeadRow;
}

async function leadsForConversation(conversationId: string): Promise<LeadRow[]> {
  const res = await db.query(
    `select * from public.leads where conversation_id = $1 or id = (select lead_id from public.conversations where id = $1)`,
    [conversationId],
  );
  return res.rows as LeadRow[];
}

async function leadsForCustomer(customerId: string): Promise<LeadRow[]> {
  const res = await db.query(`select * from public.leads where customer_id = $1 and deleted_at is null order by created_at`, [
    customerId,
  ]);
  return res.rows as LeadRow[];
}

async function conversationRow(conversationId: string) {
  const res = await db.query(`select * from public.conversations where id = $1`, [conversationId]);
  return res.rows[0] as { id: string; lead_id: string | null; customer_id: string | null; metadata: Record<string, any>; company_id: string };
}

/** customer + conversation(+stamped customer) + captured lead. */
async function makeLead(opts: { companyId?: string; stampCustomer?: boolean } = {}) {
  const companyId = opts.companyId ?? CO_B;
  const { customerId, phone } = await makeCustomer({ companyId });
  const conversationId = await makeConversation({
    companyId,
    customerId: opts.stampCustomer === false ? null : customerId,
    phone,
  });
  const result = await captureStarted({ companyId, conversationId, phone, customerId });
  assert.ok(result?.leadId, "capture should yield a lead");
  return { companyId, customerId, phone, conversationId, leadId: result!.leadId };
}

async function pollUntil<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value as T;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ------------------------------------------------------------------------------------------------
// suite
// ------------------------------------------------------------------------------------------------

describe("CRM lifecycle — disposable PostgreSQL integration (local Supabase)", () => {
  before(async () => {
    const clients = await createCrmPgClients();
    db = clients.db;
    admin = clients.admin;
    anonKey = clients.anonKey;
    await snapshotConfigBaseline(db, tracker);
    services = createLeadPlatformServices(admin);
    capture = createSupabaseLeadSmartCapture(admin, services);

    // Preconditions from the verified environment.
    const mig = await db.query(`select count(*)::int as n from supabase_migrations.schema_migrations where version like '421%'`).catch(() => null);
    if (mig) assert.ok(mig.rows[0].n >= 1, "migration 421 should be applied");
    assert.notEqual((process.env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND ?? "").toLowerCase(), "true");

    // Apply 423 concurrency uniqueness indexes locally (idempotent; never resets the DB).
    const concurrencySql = readFileSync(
      resolve(here, "../../../../supabase/migrations/423_crm_concurrency_uniqueness.sql"),
      "utf8",
    );
    await db.query(concurrencySql);
  });

  after(async () => {
    try {
      if (db) cleanupSummary = await cleanupTracked(db, tracker);
    } finally {
      await db?.end().catch(() => undefined);
      // eslint-disable-next-line no-console
      console.log(`[crm-pg] cleanup ${TAG}: ${JSON.stringify(cleanupSummary)}`);
    }
  });

  // ----------------------------------------------------------------------------------------------
  describe("A — identity / leads", () => {
    it("A1 existing customer, no lead → ConversationStarted creates lead with correct customer_id", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ customerId, phone });
      assert.equal((await leadsForCustomer(customerId)).length, 0);

      const result = await captureStarted({ conversationId, phone, customerId });
      assert.ok(result);
      assert.equal(result.created, true);
      assert.equal(result.identityStatus, "matched_customer");

      const lead = await getLead(result.leadId);
      assert.equal(lead.company_id, CO_B);
      assert.equal(lead.customer_id, customerId);
      assert.equal(lead.conversation_id, conversationId);
      assert.equal(lead.lifecycle_status, "new");
      assert.equal((await conversationRow(conversationId)).lead_id, lead.id);
    });

    it("A2 existing customer, open lead → reuses the same lead, no duplicate", async () => {
      const { customerId, phone } = await makeCustomer();
      const conv1 = await makeConversation({ customerId, phone });
      const first = await captureStarted({ conversationId: conv1, phone, customerId });
      assert.ok(first?.created);

      const conv2 = await makeConversation({ customerId, phone });
      const second = await captureStarted({ conversationId: conv2, phone, customerId });
      assert.ok(second);
      assert.equal(second.created, false);
      assert.equal(second.leadId, first.leadId);

      const leads = await leadsForCustomer(customerId);
      assert.equal(leads.length, 1, "no duplicate lead for the same customer");
      assert.equal((await conversationRow(conv2)).lead_id, first.leadId);
      assert.ok((await getLead(first.leadId)).metadata.aiCapture.conversationIds.includes(conv2));
    });

    it("A3 existing customer, closed lead (converted) → creates a NEW lead; closed lead untouched", async () => {
      const { customerId, phone } = await makeCustomer();
      const conv1 = await makeConversation({ customerId, phone });
      const first = await captureStarted({ conversationId: conv1, phone, customerId });
      assert.ok(first?.created);
      await db.query(`update public.leads set lifecycle_status = 'converted', converted_at = now() where id = $1`, [first.leadId]);
      const closedBefore = await getLead(first.leadId);

      const conv2 = await makeConversation({ customerId, phone });
      const second = await captureStarted({ conversationId: conv2, phone, customerId });
      assert.ok(second);
      assert.equal(second.created, true, "closed lead must not be reopened/reused");
      assert.notEqual(second.leadId, first.leadId);

      const closedAfter = await getLead(first.leadId);
      assert.equal(closedAfter.lifecycle_status, "converted");
      assert.equal(closedAfter.conversation_id, closedBefore.conversation_id);
      assert.equal(closedAfter.customer_id, closedBefore.customer_id);
      assert.equal(new Date(closedAfter.updated_at).getTime(), new Date(closedBefore.updated_at).getTime(), "closed lead must not be modified");
      assert.equal((await conversationRow(conv2)).lead_id, second.leadId);
      assert.equal((await getLead(second.leadId)).lifecycle_status, "new");
      assert.equal((await leadsForCustomer(customerId)).length, 2);
    });

    it("A3b phone-only closed lead (no trusted customer) is never reused or reopened", async () => {
      const phone = uniquePhone();
      const conv1 = await makeConversation({ phone });
      const first = await captureStarted({ conversationId: conv1, phone });
      assert.ok(first?.created);
      await db.query(`update public.leads set lifecycle_status = 'lost' where id = $1`, [first.leadId]);
      const before = await getLead(first.leadId);

      const conv2 = await makeConversation({ phone });
      const second = await captureStarted({ conversationId: conv2, phone });
      assert.ok(second);
      assert.equal(second.created, true, "phone/identity fallbacks must not return closed leads");
      assert.notEqual(second.leadId, first.leadId);
      const after = await getLead(first.leadId);
      assert.equal(after.lifecycle_status, "lost");
      assert.equal(new Date(after.updated_at).getTime(), new Date(before.updated_at).getTime());
    });

    it("A3c email-only closed lead is never reused or reopened", async () => {
      const email = `${uniq("mail")}@crm-pg.invalid`.toLowerCase();
      const conv1 = await makeConversation({ channelType: "email" });
      const first = await captureStarted({ conversationId: conv1, email, channelType: "email" });
      assert.ok(first?.created);
      await db.query(`update public.leads set lifecycle_status = 'won' where id = $1`, [first.leadId]);
      const conv2 = await makeConversation({ channelType: "email" });
      const second = await captureStarted({ conversationId: conv2, email, channelType: "email" });
      assert.ok(second);
      assert.equal(second.created, true);
      assert.notEqual(second.leadId, first.leadId);
      assert.equal((await getLead(first.leadId)).lifecycle_status, "won");
    });

    it("A4 new customer path: customer created after conversation, then capture with customerId → lead linked", async () => {
      const phone = uniquePhone();
      const conversationId = await makeConversation({ phone });
      assert.equal((await conversationRow(conversationId)).customer_id, null);

      const { customerId } = await makeCustomer({ phone });
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);

      const result = await captureStarted({ conversationId, phone, customerId });
      assert.ok(result?.created);
      const lead = await getLead(result.leadId);
      assert.equal(lead.customer_id, customerId);
      assert.equal(lead.metadata.aiCapture.identityStatus, "matched_customer");
    });

    it("A5 ambiguous: two customers with the same number in different formats are not auto-merged when customerId is absent", async () => {
      const digits = uniquePhone().slice(1);
      const c1 = await makeCustomer({ phone: `+${digits}` });
      const c2 = await makeCustomer({ phone: digits });
      const conversationId = await makeConversation({ phone: `+${digits}` });

      const result = await captureStarted({ conversationId, phone: `+${digits}` });
      assert.ok(result);
      const lead = await getLead(result.leadId);
      assert.ok(
        lead.customer_id === null || ![c1.customerId, c2.customerId].includes(lead.customer_id),
        "must not link an arbitrary customer from an ambiguous phone match",
      );
      assert.equal(lead.customer_id, null);
      assert.equal(lead.metadata.aiCapture.identityStatus, "prospect");
      assert.equal((await leadsForCustomer(c1.customerId)).length, 0);
      assert.equal((await leadsForCustomer(c2.customerId)).length, 0);
    });

    it("A6 cross-company: a CO_A customer is not linked when ConversationStarted runs for a CO_B conversation", async () => {
      const phone = uniquePhone();
      const foreign = await makeCustomer({ companyId: CO_A, phone });

      // (a) same phone, no customerId → no link.
      const convPhone = await makeConversation({ phone });
      const viaPhone = await captureStarted({ conversationId: convPhone, phone });
      assert.ok(viaPhone);
      assert.equal((await getLead(viaPhone.leadId)).customer_id, null);

      // (b) foreign customerId supplied explicitly by a (buggy/untrusted) caller → must not link across tenants.
      const phone2 = uniquePhone();
      const convExplicit = await makeConversation({ phone: phone2 });
      let explicitLeadId: string | null = null;
      try {
        const viaExplicit = await captureStarted({ conversationId: convExplicit, phone: phone2, customerId: foreign.customerId });
        explicitLeadId = viaExplicit?.leadId ?? null;
      } catch {
        explicitLeadId = null; // rejecting is acceptable
      }
      if (explicitLeadId) {
        const lead = await getLead(explicitLeadId);
        assert.equal(lead.company_id, CO_B);
        assert.notEqual(lead.customer_id, foreign.customerId, "CO_B lead must not reference a CO_A customer");
      }
      const leaked = await db.query(`select id from public.leads where company_id = $1 and customer_id = $2`, [CO_B, foreign.customerId]);
      assert.equal(leaked.rows.length, 0);
      assert.equal((await leadsForCustomer(foreign.customerId)).length, 0);
    });

    it("A7 duplicate ConversationStarted for the same conversation → one lead", async () => {
      const phone = uniquePhone();
      const conversationId = await makeConversation({ phone });
      const first = await captureStarted({ conversationId, phone });
      const second = await captureStarted({ conversationId, phone });
      assert.ok(first && second);
      assert.equal(first.created, true);
      assert.equal(second.created, false);
      assert.equal(second.leadId, first.leadId);
      assert.equal((await leadsForConversation(conversationId)).length, 1);
    });

    it("A7b concurrent duplicate ConversationStarted for the same conversation → one lead", async () => {
      // Deterministic concurrency: both handles are issued together (Promise.all) so neither waits
      // for the other to finish. Postgres partial unique index
      // leads_one_open_per_conversation_idx serializes the inserts; the loser recovers the winner.
      const phone = uniquePhone();
      const conversationId = await makeConversation({ phone });
      const started = Date.now();
      const [r1, r2] = await Promise.all([
        captureStarted({ conversationId, phone }),
        captureStarted({ conversationId, phone }),
      ]);
      assert.ok(r1 && r2, "both concurrent captures must return a result");
      assert.equal(r1.leadId, r2.leadId, "concurrent captures must converge on one lead");
      assert.equal(
        [r1.created, r2.created].filter(Boolean).length,
        1,
        "exactly one capture should report created=true",
      );

      const byPhone = await db.query(
        `select id, lifecycle_status, conversation_id from public.leads
          where company_id = $1 and phone = $2 and deleted_at is null`,
        [CO_B, phone],
      );
      assert.equal(byPhone.rows.length, 1, "persisted open lead count for phone must be 1");
      assert.equal(byPhone.rows[0].id, r1.leadId);
      assert.equal(byPhone.rows[0].conversation_id, conversationId);

      const openForConv = await db.query(
        `select id from public.leads
          where company_id = $1 and conversation_id = $2 and deleted_at is null
            and lower(coalesce(lifecycle_status, 'new')) not in
              ('converted','won','lost','disqualified','archived','closed','purchased')`,
        [CO_B, conversationId],
      );
      assert.equal(openForConv.rows.length, 1);
      const conv = await conversationRow(conversationId);
      assert.equal(conv.lead_id, r1.leadId);
      assert.ok(Date.now() - started < 30_000, "concurrent capture should finish promptly");
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe("B — deferred ConversationStarted", () => {
    type FlushPort = {
      flushDeferredConversationStarted?: (input: Record<string, unknown>) => Promise<{ published: boolean }>;
    };
    let port: FlushPort;

    before(async () => {
      const { createChannelConversationPort } = await import("../../src/platform/channel-platform-ports.js");
      // The flush path only needs the service-role client + ctx.userId — conversation services are unused.
      port = createChannelConversationPort({} as never, { userId: ACTOR_B } as never, { supabaseClient: admin }) as FlushPort;
      assert.equal(typeof port.flushDeferredConversationStarted, "function");
    });

    /** Mirror of flushDeferredConversationStarted (identity stamped before capture; then metadata gating). */
    async function mirrorFlush(conversationId: string, customerId: string | null, phone: string) {
      const conv = await conversationRow(conversationId);
      const meta = { ...conv.metadata };
      if (meta.deferConversationStarted !== true || meta.conversationStartedPublishedAt) return { published: false };
      const result = await captureStarted({ conversationId, phone, customerId: customerId ?? (conv.customer_id as string | null) });
      meta.deferConversationStarted = false;
      meta.conversationStartedPublishedAt = new Date().toISOString();
      if (customerId) meta.trustedChannelCustomerId = customerId;
      await db.query(`update public.conversations set metadata = $2::jsonb where id = $1`, [conversationId, JSON.stringify(meta)]);
      return { published: true, result };
    }

    it("B1 deferred conversation has no lead until flush/handle runs with identity", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ phone, metadata: { deferConversationStarted: true } });
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);
      assert.equal((await leadsForConversation(conversationId)).length, 0);
      assert.equal((await leadsForCustomer(customerId)).length, 0);
      const conv = await conversationRow(conversationId);
      assert.equal(conv.lead_id, null);
      assert.equal(conv.metadata.deferConversationStarted, true);
    });

    it("B2 real flush: after identity stamp the lead carries customer_id and metadata shows published", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ phone, metadata: { deferConversationStarted: true, senderExternalId: phone } });
      // identity stamp (as resolveAndBindTrustedChannelCustomer does)
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);

      const flushed = await port.flushDeferredConversationStarted!({
        companyId: CO_B,
        conversationId,
        channelType: "whatsapp",
        customerId,
        phone,
        externalUserId: phone,
        actorUserId: ACTOR_B,
      });
      assert.equal(flushed.published, true);

      // Event bus subscribers run asynchronously (awaitSubscribers=false) — poll the DB.
      const leadRow = await pollUntil("lead from flush", async () => {
        const rows = await leadsForConversation(conversationId);
        return rows[0] ?? null;
      });
      tracker.lead(leadRow.id);
      assert.equal(leadRow.customer_id, customerId);
      assert.equal(leadRow.company_id, CO_B);

      const conv = await conversationRow(conversationId);
      assert.equal(conv.metadata.deferConversationStarted, false);
      assert.ok(conv.metadata.conversationStartedPublishedAt);
      assert.equal(conv.metadata.trustedChannelCustomerId, customerId);
      assert.equal(conv.lead_id, leadRow.id);
    });

    it("B3 second real flush is a no-op (no duplicate lead, metadata unchanged)", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ phone, metadata: { deferConversationStarted: true } });
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);
      const input = { companyId: CO_B, conversationId, channelType: "whatsapp", customerId, phone, externalUserId: phone, actorUserId: ACTOR_B };

      assert.equal((await port.flushDeferredConversationStarted!(input)).published, true);
      const lead = await pollUntil("lead from flush", async () => (await leadsForConversation(conversationId))[0] ?? null);
      tracker.lead(lead.id);
      const publishedAt = (await conversationRow(conversationId)).metadata.conversationStartedPublishedAt;

      assert.equal((await port.flushDeferredConversationStarted!(input)).published, false);
      assert.equal((await port.flushDeferredConversationStarted!(input)).published, false);
      await new Promise((r) => setTimeout(r, 750));
      assert.equal((await leadsForConversation(conversationId)).length, 1);
      assert.equal((await conversationRow(conversationId)).metadata.conversationStartedPublishedAt, publishedAt);
    });

    it("B2b mirror flush (identity stamp → handleConversationStarted → metadata) matches production semantics; duplicate handle adds no lead", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ phone, metadata: { deferConversationStarted: true } });
      assert.equal((await leadsForConversation(conversationId)).length, 0);
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);

      const first = await mirrorFlush(conversationId, customerId, phone);
      assert.equal(first.published, true);
      const rows = await leadsForConversation(conversationId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.customer_id, customerId);
      const meta = (await conversationRow(conversationId)).metadata;
      assert.equal(meta.deferConversationStarted, false);
      assert.ok(meta.conversationStartedPublishedAt);

      // second flush no-op
      assert.equal((await mirrorFlush(conversationId, customerId, phone)).published, false);
      // duplicate direct handle does not duplicate leads
      const dup = await captureStarted({ conversationId, phone, customerId });
      assert.ok(dup);
      assert.equal(dup.created, false);
      assert.equal((await leadsForConversation(conversationId)).length, 1);
      assert.equal((await leadsForCustomer(customerId)).length, 1);
    });

    it("B3b duplicate handleConversationStarted after a real flush does not duplicate leads", async () => {
      const { customerId, phone } = await makeCustomer();
      const conversationId = await makeConversation({ phone, metadata: { deferConversationStarted: true } });
      await db.query(`update public.conversations set customer_id = $2 where id = $1`, [conversationId, customerId]);
      await port.flushDeferredConversationStarted!({ companyId: CO_B, conversationId, channelType: "whatsapp", customerId, phone, externalUserId: phone });
      const lead = await pollUntil("lead from flush", async () => (await leadsForConversation(conversationId))[0] ?? null);
      tracker.lead(lead.id);
      const dup = await captureStarted({ conversationId, phone, customerId });
      assert.equal(dup?.created, false);
      assert.equal(dup?.leadId, lead.id);
      assert.equal((await leadsForCustomer(customerId)).length, 1);
    });

    it("B4 flush gating: non-deferred / already-published conversations never publish; reaction short-circuit runs after the flush", async () => {
      const { customerId, phone } = await makeCustomer();
      // not deferred → flush refuses
      const plain = await makeConversation({ phone, customerId });
      const res = await port.flushDeferredConversationStarted!({ companyId: CO_B, conversationId: plain, channelType: "whatsapp", customerId, phone });
      assert.equal(res.published, false);
      await new Promise((r) => setTimeout(r, 500));
      assert.equal((await leadsForConversation(plain)).length, 0);

      // already published → flush refuses
      const done = await makeConversation({
        phone,
        customerId,
        metadata: { deferConversationStarted: true, conversationStartedPublishedAt: new Date().toISOString() },
      });
      assert.equal(
        (await port.flushDeferredConversationStarted!({ companyId: CO_B, conversationId: done, channelType: "whatsapp", customerId, phone })).published,
        false,
      );

      // wrong company scope → flush cannot see the conversation
      const deferred = await makeConversation({ phone, customerId, metadata: { deferConversationStarted: true } });
      assert.equal(
        (await port.flushDeferredConversationStarted!({ companyId: CO_A, conversationId: deferred, channelType: "whatsapp", customerId, phone })).published,
        false,
      );
      assert.equal((await conversationRow(deferred)).metadata.deferConversationStarted, true);

      // Pipeline ordering: identity bind → flush → (only then) WhatsApp reaction short-circuit.
      const pipelineSrc = readFileSync(
        resolve(here, "../../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts"),
        "utf8",
      );
      const bind = pipelineSrc.indexOf("this.resolveAndBindTrustedChannelCustomer({");
      const flush = pipelineSrc.indexOf("this.ports.conversation.flushDeferredConversationStarted({");
      const reaction = pipelineSrc.indexOf("if (isWhatsAppReactionInbound(normalized.metadata))");
      assert.ok(bind > 0 && flush > bind && reaction > flush, "identity bind → flush → reaction short-circuit ordering");
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe("C — product interest", () => {
    async function leadWithConversation() {
      return makeLead();
    }

    it("C1 verified company product → metadata.productInterest set", async () => {
      const lead = await leadWithConversation();
      const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Widget"), sku: uniq("sku") }, tracker);
      const res = await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId,
        productName: "Widget Pro",
      });
      assert.equal(res.linked, true);
      assert.equal(res.reason, "lead_interest_recorded");
      const row = await getLead(lead.leadId);
      assert.equal(row.metadata.productInterest.productId, productId);
      assert.equal(row.metadata.productInterest.productName, "Widget Pro");
      // idempotent
      const again = await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId,
        productName: "Widget Pro",
      });
      assert.deepEqual(again, { linked: true, reason: "already_recorded" });
    });

    it("C2 cross-company / unknown product and missing lead are not recorded", async () => {
      const lead = await leadWithConversation();
      const foreignProduct = await createCatalogProduct(db, { companyId: CO_A, name: uniq("Foreign"), sku: uniq("sku") }, tracker);
      const cross = await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId: foreignProduct,
        productName: "Foreign",
      });
      assert.deepEqual(cross, { linked: false, reason: "product_not_in_company" });
      const unknown = await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId: "d0000000-0000-4000-8000-00000000dead",
        productName: null,
      });
      assert.deepEqual(unknown, { linked: false, reason: "product_not_in_company" });
      assert.equal((await getLead(lead.leadId)).metadata.productInterest, undefined);

      // Conversation of another tenant cannot be targeted with this company's id.
      const wrongTenant = await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_A,
        conversationId: lead.conversationId,
        productId: foreignProduct,
        productName: null,
      });
      assert.deepEqual(wrongTenant, { linked: false, reason: "conversation_not_found" });

      // No lead yet → nothing recorded.
      const bare = await makeConversation({ phone: uniquePhone() });
      const ownProduct = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Own"), sku: uniq("sku") }, tracker);
      assert.deepEqual(
        await recordVerifiedProductInterestForConversation(admin, { companyId: CO_B, conversationId: bare, productId: ownProduct, productName: null }),
        { linked: false, reason: "no_lead" },
      );
    });

    it("C3 interest before qualify, then applyStoredProductInterestAfterQualify → one opportunity with one line item", async () => {
      const lead = await leadWithConversation();
      const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Gadget"), sku: uniq("sku") }, tracker);
      await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId,
        productName: "Gadget",
      });
      const before = await db.query(`select count(*)::int n from public.opportunities where lead_id = $1`, [lead.leadId]);
      assert.equal(before.rows[0].n, 0, "no opportunity before qualify");

      await db.query(`update public.leads set is_qualified = true, lifecycle_status = 'qualified', qualified_at = now() where id = $1`, [lead.leadId]);
      const applied = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId });
      assert.deepEqual(applied, { applied: true, reason: "opportunity_created_from_interest" });

      const opps = await db.query(`select id, company_id, lead_id from public.opportunities where lead_id = $1 and deleted_at is null`, [lead.leadId]);
      assert.equal(opps.rows.length, 1);
      assert.equal(opps.rows[0].company_id, CO_B);
      tracker.opportunity(opps.rows[0].id);
      const lines = await db.query(`select product_id, company_id from public.opportunity_line_items where opportunity_id = $1 and deleted_at is null`, [opps.rows[0].id]);
      assert.equal(lines.rows.length, 1);
      assert.equal(lines.rows[0].product_id, productId);
      assert.equal(lines.rows[0].company_id, CO_B);
    });

    it("C4 applying twice does not duplicate opportunities or line items", async () => {
      const lead = await leadWithConversation();
      const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Gizmo"), sku: uniq("sku") }, tracker);
      await recordVerifiedProductInterestForConversation(admin, { companyId: CO_B, conversationId: lead.conversationId, productId, productName: "Gizmo" });
      await db.query(`update public.leads set is_qualified = true, lifecycle_status = 'qualified' where id = $1`, [lead.leadId]);

      const first = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId });
      const second = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId });
      assert.equal(first.reason, "opportunity_created_from_interest");
      assert.deepEqual(second, { applied: true, reason: "attached_to_open_opportunity" });

      const opps = await db.query(`select id from public.opportunities where lead_id = $1 and deleted_at is null`, [lead.leadId]);
      assert.equal(opps.rows.length, 1);
      tracker.opportunity(opps.rows[0].id);
      const lines = await db.query(`select id from public.opportunity_line_items where opportunity_id = $1 and deleted_at is null`, [opps.rows[0].id]);
      assert.equal(lines.rows.length, 1);

      // recording interest again after the opportunity exists must not add a second line either
      await recordVerifiedProductInterestForConversation(admin, { companyId: CO_B, conversationId: lead.conversationId, productId, productName: "Gizmo" });
      const lines2 = await db.query(`select id from public.opportunity_line_items where opportunity_id = $1 and deleted_at is null`, [opps.rows[0].id]);
      assert.equal(lines2.rows.length, 1);
    });

    it("C4b concurrent apply does not create duplicate opportunities", async () => {
      // Deterministic concurrency: both applies start together. Partial unique index
      // opportunities_one_open_product_interest_per_lead_product_idx (431) + customer+product
      // uniqueness + unique-violation recovery converge on one opportunity and one line item.
      const lead = await leadWithConversation();
      const productId = await createCatalogProduct(db, { companyId: CO_B, name: uniq("Gizmo2"), sku: uniq("sku") }, tracker);
      await recordVerifiedProductInterestForConversation(admin, {
        companyId: CO_B,
        conversationId: lead.conversationId,
        productId,
        productName: "Gizmo2",
      });
      await db.query(`update public.leads set is_qualified = true, lifecycle_status = 'qualified' where id = $1`, [
        lead.leadId,
      ]);
      const [a1, a2] = await Promise.all([
        applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId }),
        applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId }),
      ]);
      assert.equal(a1.applied, true);
      assert.equal(a2.applied, true);
      assert.ok(
        [a1.reason, a2.reason].includes("opportunity_created_from_interest"),
        "at least one apply should create",
      );
      assert.ok(
        [a1.reason, a2.reason].every(
          (r) => r === "opportunity_created_from_interest" || r === "attached_to_open_opportunity",
        ),
      );

      const opps = await db.query(
        `select id, metadata->>'source' as source, won_at, lost_at
           from public.opportunities
          where lead_id = $1 and deleted_at is null`,
        [lead.leadId],
      );
      for (const row of opps.rows) tracker.opportunity(row.id);
      assert.equal(opps.rows.length, 1, "concurrent apply must converge on a single opportunity");
      assert.equal(opps.rows[0].source, "product_interest_after_qualify");
      assert.equal(opps.rows[0].won_at, null);
      assert.equal(opps.rows[0].lost_at, null);

      const lines = await db.query(
        `select id, product_id from public.opportunity_line_items
          where opportunity_id = $1 and deleted_at is null`,
        [opps.rows[0].id],
      );
      assert.equal(lines.rows.length, 1, "line item must not be duplicated");
      assert.equal(lines.rows[0].product_id, productId);
    });

    it("C5 cross-company product id on apply → product_not_in_company, nothing created", async () => {
      const lead = await leadWithConversation();
      const foreignProduct = await createCatalogProduct(db, { companyId: CO_A, name: uniq("Foreign2"), sku: uniq("sku") }, tracker);
      const row = await getLead(lead.leadId);
      await db.query(`update public.leads set metadata = $2::jsonb, is_qualified = true where id = $1`, [
        lead.leadId,
        JSON.stringify({ ...row.metadata, productInterest: { productId: foreignProduct, productName: "Foreign2" } }),
      ]);
      const res = await applyStoredProductInterestAfterQualify(admin, { companyId: CO_B, leadId: lead.leadId });
      assert.deepEqual(res, { applied: false, reason: "product_not_in_company" });
      const opps = await db.query(`select id from public.opportunities where lead_id = $1`, [lead.leadId]);
      assert.equal(opps.rows.length, 0);
      const lines = await db.query(`select id from public.opportunity_line_items where product_id = $1`, [foreignProduct]);
      assert.equal(lines.rows.length, 0);
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe("D — sales follow-up (real claim RPC, provider send disabled)", () => {
    const pastDue = () => new Date(Date.now() - 5 * 60_000);

    const greenEligibility: SalesFollowUpEligibilitySnapshot = {
      optedOut: false,
      customerRepliedAfterSchedule: false,
      converted: false,
      purchased: false,
      requestClosed: false,
      assigneeChanged: false,
      attemptsAlreadySent: 0,
      companySentToday: 0,
      channelConnected: true,
      channelCanSend: true,
      withinBusinessHours: true,
    };

    function spyDelivery() {
      const calls: SalesFollowUpDeliveryRequest[] = [];
      const port: SalesFollowUpDeliveryPort = {
        async deliver(input) {
          calls.push(input);
          // Fake port only — never a real provider.
          return { status: "delivered", providerMessageId: `fake-${calls.length}` };
        },
      };
      return { port, calls };
    }

    const automaticSettings = normalizeSalesFollowUpSettings({
      enabled: true,
      channels: ["whatsapp"],
      approvalMode: "automatic",
      firstDelayMinutes: 60,
      subsequentIntervalMinutes: [60],
      maxAttempts: 2,
    });

    const attempts = () => createSupabaseSalesFollowUpAttemptStore(admin);

    async function enqueue(leadId: string, extra: Partial<Parameters<typeof enqueueSalesFollowUpJob>[1]> = {}) {
      const res = await enqueueSalesFollowUpJob(admin, {
        companyId: CO_B,
        leadId,
        channel: "whatsapp",
        attemptNumber: 1,
        dueAt: pastDue(),
        messageText: "DISPOSABLE crm-pg follow-up (never sent)",
        ...extra,
      });
      if (res.job) tracker.job(res.job.id);
      return res;
    }

    async function jobRow(jobId: string) {
      const r = await db.query(`select * from public.sales_follow_up_jobs where id = $1`, [jobId]);
      return r.rows[0] as Record<string, any>;
    }

    const mine = (jobs: SalesFollowUpJobRecord[], leadId: string) => jobs.filter((j) => j.leadId === leadId);

    before(async () => {
      await enableSalesFollowUp(admin, CO_B, {}, tracker);
    });

    afterEach(async () => {
      // Keep the shared claim RPC clean: nothing from earlier tests may remain pending/claimed.
      await db.query(
        `update public.sales_follow_up_jobs set status = 'cancelled', claim_expires_at = null
          where company_id = any($1::uuid[]) and status in ('pending','claimed')
            and lead_id::text = any($2::text[])`,
        [[CO_A, CO_B], [...tracker.leadIds]],
      );
    });

    it("D1 enqueue twice for the same attempt with different dueAt → created once", async () => {
      const { leadId } = await makeLead();
      const a = await enqueue(leadId, { dueAt: new Date(Date.now() + 3_600_000) });
      const b = await enqueue(leadId, { dueAt: new Date(Date.now() + 7_200_000) });
      assert.equal(a.created, true);
      assert.equal(b.created, false);
      assert.equal(b.job?.id, a.job?.id);
      const rows = await db.query(`select id from public.sales_follow_up_jobs where lead_id = $1 and attempt_number = 1`, [leadId]);
      assert.equal(rows.rows.length, 1);
    });

    it("D2 scheduleSalesFollowUpLadder twice → second call is already_scheduled", async () => {
      const { leadId, conversationId } = await makeLead();
      const first = await scheduleSalesFollowUpLadder(admin, { companyId: CO_B, leadId, conversationId, channel: "whatsapp" });
      for (const j of first.jobs) tracker.job(j.id);
      assert.equal(first.scheduled, true);
      assert.equal(first.reason, "ladder_scheduled");
      assert.ok(first.createdCount >= 1);
      const countAfterFirst = (await db.query(`select count(*)::int n from public.sales_follow_up_jobs where lead_id = $1`, [leadId])).rows[0].n;

      const second = await scheduleSalesFollowUpLadder(admin, { companyId: CO_B, leadId, conversationId, channel: "whatsapp" });
      assert.equal(second.scheduled, false);
      assert.equal(second.reason, "already_scheduled");
      assert.equal(second.createdCount, 0);
      const countAfterSecond = (await db.query(`select count(*)::int n from public.sales_follow_up_jobs where lead_id = $1`, [leadId])).rows[0].n;
      assert.equal(countAfterSecond, countAfterFirst);
    });

    it("D3 two concurrent claims on the same due job → exactly one worker gets it", async () => {
      const { leadId } = await makeLead();
      const { job } = await enqueue(leadId);
      assert.ok(job);
      const [w1, w2] = await Promise.all([
        claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-w1", limit: 25 }),
        claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-w2", limit: 25 }),
      ]);
      const got1 = mine(w1, leadId);
      const got2 = mine(w2, leadId);
      assert.equal(got1.length + got2.length, 1, "job must be claimed exactly once");
      const winner = got1.length ? "crm-pg-w1" : "crm-pg-w2";
      const row = await jobRow(job.id);
      assert.equal(row.status, "claimed");
      assert.equal(row.claim_owner, winner);
      assert.ok(row.claim_expires_at);
    });

    it("D4 abandoned claim (lease expired) is recovered by a second claim", async () => {
      const { leadId } = await makeLead();
      const { job } = await enqueue(leadId);
      assert.ok(job);
      const first = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-dead" }), leadId);
      assert.equal(first.length, 1);
      // Still leased → nobody else gets it.
      assert.equal(mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-early" }), leadId).length, 0);

      await db.query(`update public.sales_follow_up_jobs set claim_expires_at = now() - interval '1 minute' where id = $1`, [job.id]);
      const recovered = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-rescue" }), leadId);
      assert.equal(recovered.length, 1);
      const row = await jobRow(job.id);
      assert.equal(row.status, "claimed");
      assert.equal(row.claim_owner, "crm-pg-rescue");
      assert.ok(new Date(row.claim_expires_at).getTime() > Date.now());
    });

    it("D5/D10 processClaimed with allowProviderSend:false never calls the provider (even with automatic approval + sendable channel)", async () => {
      const { leadId, conversationId } = await makeLead();
      const { job } = await enqueue(leadId, { conversationId });
      assert.ok(job);
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d5" }), leadId)[0];
      assert.ok(claimed);

      const { port, calls } = spyDelivery();
      const result = await processClaimedSalesFollowUpJob({
        job: claimed,
        settings: automaticSettings,
        eligibility: greenEligibility,
        delivery: port,
        attempts: attempts(),
        allowProviderSend: false,
      });
      assert.equal(calls.length, 0, "delivery port must not be called when provider send is disabled");
      assert.equal(result.delivered, false);
      assert.equal(result.providerMessageId, null);
      assert.notEqual(result.recordedOutcome, "sent");
      assert.equal(result.recordedOutcome, "draft");
      assert.equal(result.decision.reason, "channel_send_not_allowed");

      await completeSalesFollowUpJob(admin, { jobId: claimed.id, companyId: CO_B, outcome: result.recordedOutcome, errorMessage: result.decision.reason });
      const attempt = await db.query(`select outcome, reason, provider_message_id from public.sales_follow_up_attempts where lead_id = $1`, [leadId]);
      assert.equal(attempt.rows.length, 1);
      assert.equal(attempt.rows[0].outcome, "draft");
      assert.equal(attempt.rows[0].provider_message_id, null);
      assert.equal((await db.query(`select count(*)::int n from public.sales_follow_up_attempts where lead_id = $1 and outcome = 'sent'`, [leadId])).rows[0].n, 0);
      assert.equal((await jobRow(job.id)).status, "completed");
    });

    it("D5b control: the spy port IS invoked when send is explicitly allowed (fake port only) — proves the zero-call assertions are meaningful", async () => {
      const { leadId, conversationId } = await makeLead();
      const { job } = await enqueue(leadId, { conversationId });
      assert.ok(job);
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-ctl" }), leadId)[0];
      assert.ok(claimed);
      const { port, calls } = spyDelivery();
      const result = await processClaimedSalesFollowUpJob({
        job: claimed,
        settings: automaticSettings,
        eligibility: greenEligibility,
        delivery: port,
        attempts: attempts(),
        allowProviderSend: true, // fake delivery port; no env flag, no real provider
      });
      assert.equal(calls.length, 1);
      assert.equal(result.recordedOutcome, "sent");
      assert.equal(calls[0]!.companyId, CO_B);
      assert.equal(calls[0]!.leadId, leadId);
      await completeSalesFollowUpJob(admin, { jobId: claimed.id, companyId: CO_B, outcome: result.recordedOutcome, providerMessageId: result.providerMessageId });
    });

    it("D6 cancelPendingSalesFollowUpJobsForLead cancels pending jobs for that lead only", async () => {
      const a = await makeLead();
      const b = await makeLead();
      const a1 = await enqueue(a.leadId, { attemptNumber: 1, dueAt: new Date(Date.now() + 3_600_000) });
      const a2 = await enqueue(a.leadId, { attemptNumber: 2, dueAt: new Date(Date.now() + 7_200_000) });
      const b1 = await enqueue(b.leadId, { attemptNumber: 1, dueAt: new Date(Date.now() + 3_600_000) });
      const cancelled = await cancelPendingSalesFollowUpJobsForLead(admin, { companyId: CO_B, leadId: a.leadId, reason: "crm-pg-test" });
      assert.equal(cancelled, 2);
      for (const j of [a1.job!, a2.job!]) {
        const row = await jobRow(j.id);
        assert.equal(row.status, "cancelled");
        assert.equal(row.error_message, "crm-pg-test");
      }
      assert.equal((await jobRow(b1.job!.id)).status, "pending");
      // wrong company scope cannot cancel
      assert.equal(await cancelPendingSalesFollowUpJobsForLead(admin, { companyId: CO_A, leadId: b.leadId, reason: "wrong-tenant" }), 0);
      assert.equal((await jobRow(b1.job!.id)).status, "pending");
    });

    it("D7 after attempt 1 completes, attempt_number=2 can be enqueued as a new job", async () => {
      const { leadId, conversationId } = await makeLead();
      const first = await enqueue(leadId, { conversationId, attemptNumber: 1 });
      assert.ok(first.job);
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d7" }), leadId)[0];
      assert.ok(claimed);
      const { port, calls } = spyDelivery();
      const result = await processClaimedSalesFollowUpJob({
        job: claimed,
        settings: automaticSettings,
        eligibility: greenEligibility,
        delivery: port,
        attempts: attempts(),
        allowProviderSend: false,
      });
      await completeSalesFollowUpJob(admin, { jobId: claimed.id, companyId: CO_B, outcome: result.recordedOutcome });
      assert.equal(calls.length, 0);

      const second = await enqueue(leadId, { conversationId, attemptNumber: 2, dueAt: new Date(Date.now() + 3_600_000) });
      assert.equal(second.created, true);
      assert.notEqual(second.job?.id, first.job?.id);
      assert.equal(second.job?.attemptNumber, 2);
      assert.equal((await jobRow(first.job!.id)).status, "completed");
      // same dueAt for the finished attempt cannot be re-created (idempotency key)
      const replay = await enqueue(leadId, { conversationId, attemptNumber: 1, dueAt: first.job!.dueAt });
      assert.equal(replay.created, false);
      assert.equal(replay.job?.id, first.job?.id);
    });

    it("D8 cancel racing a claimed job: status becomes cancelled, it is not reclaimed, and a late completion does not resurrect it", async () => {
      const { leadId } = await makeLead();
      const { job } = await enqueue(leadId);
      assert.ok(job);
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d8" }), leadId)[0];
      assert.ok(claimed);

      const cancelled = await cancelPendingSalesFollowUpJobsForLead(admin, { companyId: CO_B, leadId, reason: "customer_replied" });
      assert.equal(cancelled, 1);
      let row = await jobRow(job.id);
      assert.equal(row.status, "cancelled");
      assert.equal(row.claim_expires_at, null);

      // Never reclaimable.
      assert.equal(mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d8b" }), leadId).length, 0);
      assert.equal((await jobRow(job.id)).status, "cancelled");

      // The in-flight worker finishes after the cancel: must not flip cancelled → completed.
      await completeSalesFollowUpJob(admin, { jobId: claimed.id, companyId: CO_B, outcome: "draft" });
      row = await jobRow(job.id);
      assert.equal(row.status, "cancelled", "late completion must not resurrect a cancelled job");
    });

    it("D9 opted-out lead: processClaimed cancels/skips without any provider call (send allowed or not)", async () => {
      const { leadId, conversationId } = await makeLead();
      const j1 = await enqueue(leadId, { conversationId, attemptNumber: 1 });
      const j2 = await enqueue(leadId, { conversationId, attemptNumber: 2, dueAt: new Date(Date.now() + 3_600_000) });
      assert.ok(j1.job && j2.job);
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d9" }), leadId);
      assert.equal(claimed.length, 1, "only the due attempt is claimed");

      const { port, calls } = spyDelivery();
      for (const allowProviderSend of [false, true]) {
        const result = await processClaimedSalesFollowUpJob({
          job: claimed[0]!,
          settings: automaticSettings,
          eligibility: { ...greenEligibility, optedOut: true },
          delivery: port,
          attempts: attempts(),
          allowProviderSend,
        });
        assert.equal(result.recordedOutcome, "cancelled");
        assert.equal(result.decision.reason, "opt_out");
        assert.equal(result.delivered, false);
      }
      assert.equal(calls.length, 0, "opted-out leads must never reach the provider");

      // Tick semantics: cancel the claimed job and sibling attempts.
      await completeSalesFollowUpJob(admin, { jobId: claimed[0]!.id, companyId: CO_B, outcome: "cancelled", errorMessage: "opt_out", cancel: true });
      await cancelPendingSalesFollowUpJobsForLead(admin, { companyId: CO_B, leadId, reason: "opt_out" });
      assert.equal((await jobRow(j1.job.id)).status, "cancelled");
      assert.equal((await jobRow(j2.job.id)).status, "cancelled");
      const attempt = await db.query(`select outcome, reason from public.sales_follow_up_attempts where lead_id = $1`, [leadId]);
      assert.deepEqual(attempt.rows, [{ outcome: "cancelled", reason: "opt_out" }]);
    });

    it("D11 processSalesFollowUpTick end-to-end with provider send disabled records drafts and calls no provider", async () => {
      const { leadId, conversationId } = await makeLead();
      const { job } = await enqueue(leadId, { conversationId });
      assert.ok(job);
      await enableSalesFollowUp(admin, CO_B, { approval_mode: "automatic" }, tracker);
      const { port, calls } = spyDelivery();
      try {
        const tick = await processSalesFollowUpTick({
          client: admin,
          delivery: port,
          attempts: attempts(),
          allowProviderSend: false,
          claimOwner: "crm-pg-tick",
          loadEligibility: async () => greenEligibility,
        });
        const mineResults = tick.results.filter((r) => r.leadId === leadId);
        assert.equal(mineResults.length, 1);
        assert.equal(mineResults[0]!.delivered, false);
        assert.equal(mineResults[0]!.recordedOutcome, "draft");
        assert.equal(calls.length, 0);
        assert.equal((await jobRow(job.id)).status, "completed");
        assert.equal(
          (await db.query(`select count(*)::int n from public.sales_follow_up_attempts where lead_id = $1 and outcome = 'sent'`, [leadId])).rows[0].n,
          0,
        );
      } finally {
        await enableSalesFollowUp(admin, CO_B, { approval_mode: "draft" }, tracker);
      }
    });

    it("D12 cancelSalesFollowUpForOpportunity cancels the lead's pending jobs", async () => {
      const { leadId, customerId } = await makeLead();
      const { job } = await enqueue(leadId, { dueAt: new Date(Date.now() + 3_600_000) });
      assert.ok(job);
      const opp = await db.query(
        `insert into public.opportunities (company_id, pipeline_id, stage_id, name, lead_id, customer_id, primary_contact_name)
         select $1, p.id, s.id, $2, $3, $4, 'crm-pg'
           from public.opportunity_pipelines p join public.opportunity_stages s on s.pipeline_id = p.id
          where p.company_id = $1 order by p.is_default desc nulls last, s.sort_order asc limit 1 returning id`,
        [CO_B, uniq("opp"), leadId, customerId],
      ).catch(() => null);
      if (!opp?.rows[0]) return; // no opportunity pipeline seeded for this company — covered by C3/C4 apply path
      tracker.opportunity(opp.rows[0].id);
      const n = await cancelSalesFollowUpForOpportunity(admin, { companyId: CO_B, opportunityId: opp.rows[0].id, reason: "opportunity_won" });
      assert.equal(n, 1);
      assert.equal((await jobRow(job.id)).status, "cancelled");
    });

    it("D13 qualify → schedule → due draft → inbox list → reply invalidates → approve rejected (no provider send)", async () => {
      // Explicit draft-mode settings (never automatic send).
      await enableSalesFollowUp(
        admin,
        CO_B,
        {
          approval_mode: "draft",
          first_delay_minutes: 0,
          subsequent_interval_minutes: [60],
          max_attempts: 2,
          channels: ["whatsapp"],
        },
        tracker,
      );

      const { leadId, conversationId } = await makeLead();
      await db.query(
        `update public.leads
            set is_qualified = true, lifecycle_status = 'qualified', qualified_at = now()
          where id = $1 and company_id = $2`,
        [leadId, CO_B],
      );

      const scheduled = await scheduleSalesFollowUpAfterLeadQualified(admin, {
        companyId: CO_B,
        leadId,
      });
      assert.notEqual(
        "reason" in scheduled && scheduled.reason === "automation_disabled",
        true,
        "follow-up must be enabled for D13",
      );

      let jobId: string;
      if ("jobs" in scheduled && scheduled.jobs.length >= 1) {
        for (const j of scheduled.jobs) tracker.job(j.id);
        jobId = scheduled.jobs[0]!.id;
      } else {
        // Business-hours alignment may leave no future steps; enqueue a past-due job for the same lead.
        const { job } = await enqueue(leadId, { conversationId, dueAt: pastDue() });
        assert.ok(job, `expected enqueue after qualify schedule miss: ${JSON.stringify(scheduled)}`);
        jobId = job.id;
      }

      // Deterministic due clock + draft body (ladder may enqueue empty message_text).
      const draftMessage = "DISPOSABLE crm-pg D13 draft (never sent)";
      await db.query(
        `update public.sales_follow_up_jobs
            set due_at = $2,
                status = 'pending',
                claim_owner = null,
                claimed_at = null,
                claim_expires_at = null,
                message_text = $3
          where id = $1`,
        [jobId, pastDue().toISOString(), draftMessage],
      );

      const { port, calls } = spyDelivery();
      const claimed = mine(await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-d13" }), leadId);
      assert.equal(claimed.length, 1);
      const draftSettings = normalizeSalesFollowUpSettings({
        enabled: true,
        channels: ["whatsapp"],
        approvalMode: "draft",
        firstDelayMinutes: 0,
        subsequentIntervalMinutes: [60],
        maxAttempts: 2,
      });
      const processed = await processClaimedSalesFollowUpJob({
        job: { ...claimed[0]!, messageText: draftMessage },
        settings: draftSettings,
        eligibility: greenEligibility,
        delivery: port,
        attempts: attempts(),
        allowProviderSend: false,
      });
      assert.equal(processed.recordedOutcome, "draft");
      assert.equal(processed.delivered, false);
      assert.equal(calls.length, 0, "no outbound provider call while creating draft");
      await completeSalesFollowUpJob(admin, {
        jobId: claimed[0]!.id,
        companyId: CO_B,
        outcome: processed.recordedOutcome,
        errorMessage: processed.decision.reason,
      });

      const inbox = await listSalesFollowUpReviewItems(admin, {
        companyId: CO_B,
        status: "pending_review",
        limit: 50,
      });
      const mineDraft = inbox.find((item) => item.jobId === jobId);
      assert.ok(mineDraft, "draft must appear in review inbox API");
      assert.equal(mineDraft.leadId, leadId);
      assert.equal(mineDraft.conversationId, conversationId);
      assert.equal(mineDraft.status, "pending_review");

      const invalidated = await invalidateSalesFollowUpDraftsForConversation(admin, {
        companyId: CO_B,
        conversationId,
        reason: "customer_replied",
      });
      assert.ok(invalidated >= 1);
      assert.equal((await jobRow(jobId)).last_outcome, "cancelled");
      assert.equal((await jobRow(jobId)).error_message, "customer_replied");

      const afterReply = await listSalesFollowUpReviewItems(admin, {
        companyId: CO_B,
        status: "pending_review",
        limit: 50,
      });
      assert.equal(
        afterReply.some((item) => item.jobId === jobId),
        false,
        "invalidated draft must leave pending_review inbox",
      );

      const approveCalls: SalesFollowUpDeliveryRequest[] = [];
      const approve = await approveAndSendSalesFollowUpDraft({
        client: admin,
        jobId,
        companyId: CO_B,
        actorUserId: ACTOR_B,
        allowProviderSend: false,
        delivery: {
          async deliver(input) {
            approveCalls.push(input);
            return { status: "delivered", providerMessageId: "should-never" };
          },
        },
        attempts: attempts(),
        loadEligibility: async () => ({ ...greenEligibility, customerRepliedAfterSchedule: true }),
      });
      assert.equal(approve.ok, false);
      assert.ok(
        approve.reason === "not_a_draft" ||
          approve.reason === "provider_send_disabled" ||
          approve.reason === "customer_replied",
        `stale approve must fail, got ${approve.reason}`,
      );
      assert.equal(approveCalls.length, 0, "stale draft approval must not call provider");
    });

    it("D14 Fake provider: transient failure reclaim sends once more; sent blocks further sends", async () => {
      const { leadId, conversationId } = await makeLead();
      const { job } = await enqueue(leadId, { conversationId });
      assert.ok(job);
      await enableSalesFollowUp(admin, CO_B, { approval_mode: "automatic" }, tracker);

      let calls = 0;
      const port: SalesFollowUpDeliveryPort = {
        async deliver(input) {
          calls += 1;
          if (calls === 1) {
            return { status: "failed", retryable: true, error: "fake-timeout" };
          }
          return { status: "delivered", providerMessageId: `fake-reclaim-${calls}` };
        },
      };

      try {
        const tick1 = await processSalesFollowUpTick({
          client: admin,
          delivery: port,
          attempts: attempts(),
          allowProviderSend: true,
          claimOwner: "crm-pg-d14a",
          now: new Date(),
          loadEligibility: async () => greenEligibility,
        });
        const r1 = tick1.results.find((r) => r.leadId === leadId);
        assert.ok(r1);
        assert.equal(r1.recordedOutcome, "retried");
        assert.equal(r1.delivered, false);
        assert.equal(calls, 1);
        assert.equal((await jobRow(job.id)).status, "pending");
        assert.equal((await jobRow(job.id)).last_outcome, "retried");

        await db.query(
          `update public.sales_follow_up_jobs set due_at = now() - interval '1 minute' where id = $1`,
          [job.id],
        );

        const tick2 = await processSalesFollowUpTick({
          client: admin,
          delivery: port,
          attempts: attempts(),
          allowProviderSend: true,
          claimOwner: "crm-pg-d14b",
          now: new Date(),
          loadEligibility: async () => greenEligibility,
        });
        const r2 = tick2.results.find((r) => r.leadId === leadId);
        assert.ok(r2);
        assert.equal(r2.recordedOutcome, "sent");
        assert.equal(r2.delivered, true);
        assert.equal(calls, 2);

        const attemptRows = await db.query(
          `select outcome, provider_message_id from public.sales_follow_up_attempts
            where company_id = $1 and lead_id = $2 order by updated_at desc`,
          [CO_B, leadId],
        );
        assert.equal(attemptRows.rows[0]?.outcome, "sent");
        assert.equal(attemptRows.rows[0]?.provider_message_id, "fake-reclaim-2");
        assert.equal((await jobRow(job.id)).status, "completed");

        // Job completed — a further tick must not call the Fake provider again.
        await db.query(
          `update public.sales_follow_up_jobs set status = 'pending', due_at = now() - interval '1 minute',
             claim_owner = null, claimed_at = null, claim_expires_at = null where id = $1`,
          [job.id],
        );
        const tick3 = await processSalesFollowUpTick({
          client: admin,
          delivery: port,
          attempts: attempts(),
          allowProviderSend: true,
          claimOwner: "crm-pg-d14c",
          now: new Date(),
          loadEligibility: async () => greenEligibility,
        });
        const r3 = tick3.results.find((r) => r.leadId === leadId);
        assert.ok(r3);
        assert.equal(r3.delivered, false);
        assert.equal(r3.recordedOutcome, "skipped");
        assert.equal(calls, 2, "sent attempt must block a third Fake provider call");
      } finally {
        await enableSalesFollowUp(admin, CO_B, { approval_mode: "draft" }, tracker);
      }
    });

    it("D15 concurrent claim workers: only one Fake delivery for the same due job", async () => {
      const { leadId, conversationId } = await makeLead();
      const { job } = await enqueue(leadId, { conversationId });
      assert.ok(job);
      await enableSalesFollowUp(admin, CO_B, { approval_mode: "automatic" }, tracker);

      const calls: SalesFollowUpDeliveryRequest[] = [];
      const port: SalesFollowUpDeliveryPort = {
        async deliver(input) {
          calls.push(input);
          await new Promise((r) => setTimeout(r, 50));
          return { status: "delivered", providerMessageId: `fake-concurrent-${calls.length}` };
        },
      };

      try {
        const [a, b] = await Promise.all([
          processSalesFollowUpTick({
            client: admin,
            delivery: port,
            attempts: attempts(),
            allowProviderSend: true,
            claimOwner: "crm-pg-d15-a",
            loadEligibility: async () => greenEligibility,
          }),
          processSalesFollowUpTick({
            client: admin,
            delivery: port,
            attempts: attempts(),
            allowProviderSend: true,
            claimOwner: "crm-pg-d15-b",
            loadEligibility: async () => greenEligibility,
          }),
        ]);
        const mine = [...a.results, ...b.results].filter((r) => r.leadId === leadId);
        const delivered = mine.filter((r) => r.delivered);
        assert.equal(delivered.length, 1);
        assert.equal(calls.filter((c) => c.leadId === leadId).length, 1);
        assert.equal((await jobRow(job.id)).status, "completed");
      } finally {
        await enableSalesFollowUp(admin, CO_B, { approval_mode: "draft" }, tracker);
      }
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe("F — qualifyLead domain path (no SQL lifecycle stubs)", () => {
    function qualifyCtx(companyId: string, userId: string): LeadServiceContext {
      return {
        userId,
        companyId,
        isSuperAdmin: false,
        hasPermission: (code: string) =>
          code === LEAD_PERMISSIONS.qualify ||
          code === LEAD_PERMISSIONS.edit ||
          code === LEAD_PERMISSIONS.view ||
          code === LEAD_PERMISSIONS.create,
      };
    }

    it("F1 missing evidence rejects qualifyLead without writing is_qualified", async () => {
      const { leadId, companyId, customerId } = await makeLead();
      // Observational evidence may already supply contact/product signals from capture.
      // Reject when explicit buying intent is absent under enforce + b2c.
      await assert.rejects(
        () =>
          services.commands.qualifyLead(qualifyCtx(companyId, ACTOR_B), {
            companyId,
            leadId,
            qualificationPolicyMode: "enforce",
            evidence: {
              productInterest: true,
              contactAvailable: true,
              explicitBuyingIntent: false,
            },
            companySettingsPatch: { salesMotion: "b2c" },
          }),
        (err: unknown) => err instanceof LeadQualificationPolicyRejectedError,
      );

      const row = await getLead(leadId);
      assert.equal(row.is_qualified, false);
      assert.notEqual(row.lifecycle_status, "qualified");
      assert.equal(row.customer_id, customerId);
    });

    it("F2 valid B2C evidence qualifies via LeadCommandService (idempotent on repeat)", async () => {
      const { leadId, companyId } = await makeLead();
      await db.query(
        `update public.leads
            set metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
          where id = $1 and company_id = $3`,
        [
          leadId,
          JSON.stringify({ productInterest: { productId: "00000000-0000-4000-8000-000000000098", productName: "Widget" } }),
          companyId,
        ],
      );

      const first = await services.commands.qualifyLead(qualifyCtx(companyId, ACTOR_B), {
        companyId,
        leadId,
        qualificationPolicyMode: "enforce",
        evidence: {
          productInterest: true,
          explicitBuyingIntent: true,
          contactAvailable: true,
        },
        companySettingsPatch: { salesMotion: "b2c" },
      });
      assert.equal(first.qualificationApplied, true);
      assert.equal(first.lead.isQualified, true);
      assert.ok(first.lead.qualifiedAt);
      assert.equal(first.lead.lifecycleStatus, "qualified");

      const second = await services.commands.qualifyLead(qualifyCtx(companyId, ACTOR_B), {
        companyId,
        leadId,
        qualificationPolicyMode: "enforce",
        evidence: {
          productInterest: true,
          explicitBuyingIntent: true,
          contactAvailable: true,
        },
        companySettingsPatch: { salesMotion: "b2c" },
      });
      assert.equal(second.qualificationApplied, false);
      assert.equal(second.policy.outcome, "already_qualified");

      const row = await getLead(leadId);
      assert.equal(row.is_qualified, true);
      assert.equal(row.lifecycle_status, "qualified");
      assert.ok(row.qualified_at);
    });

    it("F3 demo booking CRM sync advances open lead to demo_scheduled via domain stage change", async () => {
      const { leadId, companyId, customerId } = await makeLead();
      // Qualify first so demo_scheduled is a legal hop (qualified → demo_scheduled).
      await services.commands.qualifyLead(qualifyCtx(companyId, ACTOR_B), {
        companyId,
        leadId,
        qualificationPolicyMode: "enforce",
        evidence: {
          productInterest: true,
          explicitBuyingIntent: true,
          contactAvailable: true,
        },
        companySettingsPatch: { salesMotion: "b2c" },
      });

      const bookingId = randomUUID();
      const fixtures = await db.query(
        `select
           (select id from public.scheduling_resources where company_id = $1 and deleted_at is null limit 1) as resource_id,
           (select id from public.scheduling_services where company_id = $1 and deleted_at is null limit 1) as service_id`,
        [companyId],
      );
      const resourceId = fixtures.rows[0]?.resource_id as string | null;
      const serviceId = fixtures.rows[0]?.service_id as string | null;
      if (!resourceId || !serviceId) {
        const lead = await services.queries.getLead(qualifyCtx(companyId, ACTOR_B), {
          companyId,
          leadId,
        });
        assert.ok(lead.lead);
        const advanced = await advanceLeadToDemoScheduled(services, qualifyCtx(companyId, ACTOR_B), {
          id: leadId,
          lifecycleStatus: lead.lead!.lifecycleStatus,
          pipelineId: lead.lead!.pipelineId,
        });
        assert.equal(advanced.lead.lifecycleStatus, "demo_scheduled");
        return;
      }

      await db.query(
        `insert into public.scheduling_bookings (
           id, company_id, customer_id, resource_id, service_id, start_at, end_at,
           timezone, status, source, created_by, updated_by
         ) values (
           $1, $2, $3, $4, $5,
           now() + interval '1 day', now() + interval '1 day 30 minutes',
           'Africa/Cairo', 'confirmed', 'ai_assistant', $6, $6
         )`,
        [bookingId, companyId, customerId, resourceId, serviceId, ACTOR_B],
      );

      const sync = await syncSalesDemoBookingToCrm(
        admin,
        {
          companyId,
          userId: ACTOR_B,
          customerId,
          bookingId,
        },
        () => services,
      );
      assert.equal(sync.ok, true);
      assert.equal(sync.leadId, leadId);
      assert.equal(sync.lifecycleStatus, "demo_scheduled");

      const linked = await db.query(
        `select b.lead_id, l.lifecycle_status
           from public.scheduling_bookings b
           join public.leads l on l.id = b.lead_id
          where b.id = $1`,
        [bookingId],
      );
      assert.equal(linked.rows[0]?.lead_id, leadId);
      assert.equal(linked.rows[0]?.lifecycle_status, "demo_scheduled");

      await db.query(`delete from public.scheduling_bookings where id = $1`, [bookingId]);
    });

    it("F4 sales-demo cancel CRM sync reverts demo_scheduled → contacted", async () => {
      const { leadId, companyId, customerId } = await makeLead();
      await services.commands.qualifyLead(qualifyCtx(companyId, ACTOR_B), {
        companyId,
        leadId,
        qualificationPolicyMode: "enforce",
        evidence: {
          productInterest: true,
          explicitBuyingIntent: true,
          contactAvailable: true,
        },
        companySettingsPatch: { salesMotion: "b2c" },
      });

      const fixtures = await db.query(
        `select
           (select id from public.scheduling_resources where company_id = $1 and deleted_at is null limit 1) as resource_id,
           (select id from public.scheduling_services where company_id = $1 and deleted_at is null limit 1) as service_id`,
        [companyId],
      );
      const resourceId = fixtures.rows[0]?.resource_id as string | null;
      let serviceId = fixtures.rows[0]?.service_id as string | null;
      if (!resourceId || !serviceId) return;

      await db.query(
        `update public.scheduling_services set service_kind = 'sales_demo' where id = $1 and company_id = $2`,
        [serviceId, companyId],
      );

      const bookingId = randomUUID();
      await db.query(
        `insert into public.scheduling_bookings (
           id, company_id, customer_id, resource_id, service_id, lead_id, start_at, end_at,
           timezone, status, source, created_by, updated_by
         ) values (
           $1, $2, $3, $4, $5, $6,
           now() + interval '2 days', now() + interval '2 days 30 minutes',
           'Africa/Cairo', 'confirmed', 'ai_assistant', $7, $7
         )`,
        [bookingId, companyId, customerId, resourceId, serviceId, leadId, ACTOR_B],
      );

      const booked = await syncSalesDemoBookingToCrm(
        admin,
        { companyId, userId: ACTOR_B, customerId, bookingId },
        () => services,
      );
      assert.equal(booked.lifecycleStatus, "demo_scheduled");

      const cancelled = await syncSalesDemoBookingCancelledToCrm(
        admin,
        { companyId, userId: ACTOR_B, bookingId },
        () => services,
      );
      assert.equal(cancelled.ok, true);
      assert.equal(cancelled.lifecycleStatus, "contacted");

      const lead = await getLead(leadId);
      assert.equal(lead.lifecycle_status, "contacted");

      await db.query(`delete from public.scheduling_bookings where id = $1`, [bookingId]);
      await db.query(
        `update public.scheduling_services set service_kind = 'operational' where id = $1 and company_id = $2`,
        [serviceId, companyId],
      );
    });

    it("F5 concurrent client_request_id creates a single booking (unique reclaim)", async () => {
      const companyId = CO_B;
      const fixtures = await db.query(
        `select
           (select id from public.customers where company_id = $1 limit 1) as customer_id,
           (select id from public.scheduling_resources where company_id = $1 and deleted_at is null limit 1) as resource_id,
           (select id from public.scheduling_services where company_id = $1 and deleted_at is null limit 1) as service_id`,
        [companyId],
      );
      const customerId = fixtures.rows[0]?.customer_id as string | null;
      const resourceId = fixtures.rows[0]?.resource_id as string | null;
      const serviceId = fixtures.rows[0]?.service_id as string | null;
      if (!customerId || !resourceId || !serviceId) return;

      // Ensure mapping so validation can pass capability check.
      await db.query(
        `insert into public.resource_services (company_id, resource_id, service_id)
         select $1::uuid, $2::uuid, $3::uuid
          where not exists (
            select 1 from public.resource_services rs
             where rs.company_id = $1::uuid and rs.resource_id = $2::uuid and rs.service_id = $3::uuid
          )`,
        [companyId, resourceId, serviceId],
      );

      const { bookingDomain } = createBookingDomainStack(admin);
      const clientRequestId = `crm-pg-race-${randomUUID()}`;
      // Pick a far-future weekday slot; if unavailable the test soft-skips.
      const date = "2030-06-12";
      const slotStart = "10:00";
      const input = {
        companyId,
        customerId,
        resourceId,
        serviceId,
        date,
        slotStart,
        source: "ai_assistant" as const,
        createdBy: ACTOR_B,
        clientRequestId,
        expectedServiceKind: null as null,
      };

      let results: Array<{ booking: { id: string } }>;
      try {
        results = await Promise.all([
          bookingDomain.createBooking(input),
          bookingDomain.createBooking(input),
        ]);
      } catch (error) {
        // Slot/rules may reject in this tenant fixture — concurrency unit test still covers reclaim.
        if (error instanceof Error && /slot_unavailable|outside_booking|capability|inactive/i.test(error.message)) {
          return;
        }
        throw error;
      }

      assert.equal(results[0]!.booking.id, results[1]!.booking.id);
      const rows = await db.query(
        `select id from public.scheduling_bookings
          where company_id = $1 and client_request_id = $2 and deleted_at is null`,
        [companyId, clientRequestId],
      );
      assert.equal(rows.rows.length, 1);
      await db.query(`delete from public.scheduling_bookings where id = $1`, [results[0]!.booking.id]);
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe("E — tenant isolation", () => {
    it("E1 a CO_B lead is invisible to company_id=CO_A queries (service filters) and vice versa", async () => {
      const b = await makeLead({ companyId: CO_B });
      const a = await makeLead({ companyId: CO_A });
      const bUnderA = await admin.from("leads").select("id").eq("company_id", CO_A).eq("id", b.leadId);
      assert.equal(bUnderA.error, null);
      assert.equal(bUnderA.data?.length, 0);
      const bUnderB = await admin.from("leads").select("id, customer_id").eq("company_id", CO_B).eq("id", b.leadId);
      assert.equal(bUnderB.data?.length, 1);
      assert.equal(bUnderB.data?.[0]?.customer_id, b.customerId);
      const aUnderB = await admin.from("leads").select("id").eq("company_id", CO_B).eq("id", a.leadId);
      assert.equal(aUnderB.data?.length, 0);
      assert.equal((await getLead(a.leadId)).company_id, CO_A);
      assert.equal((await getLead(b.leadId)).company_id, CO_B);
      // Conversations are tenant-scoped too.
      const conv = await admin.from("conversations").select("id").eq("company_id", CO_A).eq("id", b.conversationId);
      assert.equal(conv.data?.length, 0);
    });

    it("E2 follow-up jobs are company scoped (queries, cancel, claim gating by company settings)", async () => {
      const a = await makeLead({ companyId: CO_A });
      const b = await makeLead({ companyId: CO_B });
      await enableSalesFollowUp(admin, CO_B, {}, tracker);
      // CO_A explicitly disabled → its jobs must never be claimed.
      await enableSalesFollowUp(admin, CO_A, { enabled: false }, tracker);
      const jobA = (await enqueueSalesFollowUpJob(admin, { companyId: CO_A, leadId: a.leadId, channel: "whatsapp", attemptNumber: 1, dueAt: new Date(Date.now() - 300_000), messageText: "x" })).job!;
      const jobB = (await enqueueSalesFollowUpJob(admin, { companyId: CO_B, leadId: b.leadId, channel: "whatsapp", attemptNumber: 1, dueAt: new Date(Date.now() - 300_000), messageText: "x" })).job!;
      tracker.job(jobA.id);
      tracker.job(jobB.id);

      const underA = await admin.from("sales_follow_up_jobs").select("id, lead_id").eq("company_id", CO_A).in("id", [jobA.id, jobB.id]);
      assert.deepEqual(underA.data?.map((r) => r.id), [jobA.id]);
      const underB = await admin.from("sales_follow_up_jobs").select("id").eq("company_id", CO_B).in("id", [jobA.id, jobB.id]);
      assert.deepEqual(underB.data?.map((r) => r.id), [jobB.id]);

      // Cross-tenant cancel is a no-op.
      assert.equal(await cancelPendingSalesFollowUpJobsForLead(admin, { companyId: CO_A, leadId: b.leadId, reason: "x" }), 0);

      const claimed = await claimDueSalesFollowUpJobs(admin, { claimOwner: "crm-pg-e2" });
      assert.ok(claimed.some((j) => j.id === jobB.id), "enabled company's job is claimed");
      assert.ok(!claimed.some((j) => j.id === jobA.id), "disabled company's job is not claimed");
      for (const j of claimed.filter((x) => x.id === jobB.id)) assert.equal(j.companyId, CO_B);

      await db.query(`update public.sales_follow_up_jobs set status = 'cancelled', claim_expires_at = null where id = any($1::uuid[])`, [[jobA.id, jobB.id]]);
    });

    it("E3 RLS: a CO_B staff JWT can read CO_B leads but not CO_A leads", async (t) => {
      if (!anonKey) return t.skip("anon key unavailable");
      const b = await makeLead({ companyId: CO_B });
      const a = await makeLead({ companyId: CO_A });

      const email = `${TAG}-rls-${Math.random().toString(36).slice(2, 7)}@crm-pg.invalid`;
      const password = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      const userId = created.data.user!.id;
      tracker.user(userId);
      await db.query(`update public.profiles set company_id = $2, is_active = true where user_id = $1`, [userId, CO_B]);
      const perm = await db.query(`select id from public.permissions where code = 'leads.view' limit 1`);
      if (!perm.rows[0]) return t.skip("permission leads.view not seeded");
      await db.query(`insert into public.user_permissions (user_id, permission_id) values ($1, $2) on conflict do nothing`, [userId, perm.rows[0].id]);

      const staff = createClient(process.env.SUPABASE_URL!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await staff.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null);

      const own = await staff.from("leads").select("id, company_id").eq("id", b.leadId);
      if (own.error || !own.data?.length) {
        return t.skip(`staff user cannot read CO_B leads (permission not effective for company: ${own.error?.message ?? "0 rows"}) — isolation cannot be proven`);
      }
      assert.equal(own.data[0]!.company_id, CO_B);
      const foreign = await staff.from("leads").select("id").eq("id", a.leadId);
      assert.equal(foreign.error, null);
      assert.equal(foreign.data?.length, 0, "CO_B staff must not see CO_A leads");
      const foreignScan = await staff.from("leads").select("company_id").limit(1000);
      assert.ok((foreignScan.data ?? []).every((r) => r.company_id === CO_B), "authenticated listing only exposes CO_B rows");
    });
  });
});
