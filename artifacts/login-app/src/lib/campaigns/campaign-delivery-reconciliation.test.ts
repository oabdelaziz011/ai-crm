/**
 * Campaign WhatsApp delivery & reply reconciliation — pure unit tests (A–P).
 * No DB / Meta / queue / campaign execution.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyCampaignLifecyclePatch,
  computeCampaignDeliveryStatusPatch,
  computeCampaignReplyPatch,
  computeCampaignSendSuccessPatch,
  normalizeProviderMessageId,
  type CampaignRecipientLifecycleSnapshot,
} from "./campaign-delivery-reconciliation.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const T0 = "2026-08-31T10:00:00.000Z";
const T1 = "2026-08-31T10:01:00.000Z";
const T2 = "2026-08-31T10:02:00.000Z";
const T3 = "2026-08-31T10:03:00.000Z";
const WAMID = "wamid.HBgNMTIzNDU2Nzg5MA";

function row(
  partial: Partial<CampaignRecipientLifecycleSnapshot> = {},
): CampaignRecipientLifecycleSnapshot {
  return {
    id: "rec-1",
    company_id: "co-a",
    status: "queued",
    provider_message_id: null,
    notification_queue_id: "queue-1",
    sent_at: null,
    delivered_at: null,
    read_at: null,
    failed_at: null,
    replied_at: null,
    error_message: null,
    ...partial,
  };
}

describe("campaign delivery reconciliation (A–P)", () => {
  it("A) queued → sent", () => {
    const patch = computeCampaignSendSuccessPatch(row(), {
      providerMessageId: WAMID,
      occurredAt: T0,
    });
    assert.deepEqual(patch, {
      provider_message_id: WAMID,
      sent_at: T0,
      status: "sent",
    });
  });

  it("B) sent → delivered", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
    });
    const patch = computeCampaignDeliveryStatusPatch(current, {
      status: "delivered",
      occurredAt: T1,
    });
    assert.deepEqual(patch, { delivered_at: T1 });
  });

  it("C) delivered → read", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      delivered_at: T1,
    });
    const patch = computeCampaignDeliveryStatusPatch(current, {
      status: "read",
      occurredAt: T2,
    });
    assert.deepEqual(patch, { read_at: T2 });
  });

  it("D) read event arriving before delivered", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
    });
    const patch = computeCampaignDeliveryStatusPatch(current, {
      status: "read",
      occurredAt: T2,
    });
    assert.equal(patch?.read_at, T2);
    assert.equal(patch?.delivered_at, T2);
    assert.equal(patch?.sent_at, undefined);
  });

  it("E) delivered event arriving after read (no regression)", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      delivered_at: T2,
      read_at: T2,
    });
    const lateDelivered = computeCampaignDeliveryStatusPatch(current, {
      status: "delivered",
      occurredAt: T1,
    });
    // Already has delivered_at + higher rank read → only possible fill is noop
    assert.equal(lateDelivered, null);

    const readFirst = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      read_at: T2,
      delivered_at: null,
    });
    const fillDelivered = computeCampaignDeliveryStatusPatch(readFirst, {
      status: "delivered",
      occurredAt: T1,
    });
    assert.deepEqual(fillDelivered, { delivered_at: T1 });
    assert.equal(fillDelivered?.read_at, undefined);
  });

  it("F) duplicate delivered webhook is idempotent", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      delivered_at: T1,
    });
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "delivered",
        occurredAt: T3,
      }),
      null,
    );
  });

  it("G) duplicate read webhook is idempotent", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      delivered_at: T1,
      read_at: T2,
    });
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "read",
        occurredAt: T3,
      }),
      null,
    );
  });

  it("H) failed webhook", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
      delivered_at: T1,
    });
    const patch = computeCampaignDeliveryStatusPatch(current, {
      status: "failed",
      occurredAt: T2,
    });
    assert.deepEqual(patch, { failed_at: T2, status: "failed" });
    const next = applyCampaignLifecyclePatch(current, patch!);
    assert.equal(next.provider_message_id, WAMID);
    assert.equal(next.sent_at, T0);
    assert.equal(next.delivered_at, T1);
  });

  it("I) reply with matching context.id", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
    });
    const patch = computeCampaignReplyPatch(current, { occurredAt: T3 });
    assert.deepEqual(patch, { replied_at: T3 });
  });

  it("J) reply without context.id (no attribution)", () => {
    assert.equal(normalizeProviderMessageId(null), null);
    assert.equal(normalizeProviderMessageId(""), null);
    assert.equal(normalizeProviderMessageId("   "), null);
    // Persistence layer returns missing_context_id when null — pure layer N/A.
    const current = row({ provider_message_id: WAMID, status: "sent", sent_at: T0 });
    // Already replied is idempotent
    assert.equal(
      computeCampaignReplyPatch(
        { ...current, replied_at: T1 },
        { occurredAt: T3 },
      ),
      null,
    );
  });

  it("K) context.id belonging to another company (isolation via company scope)", () => {
    // Pure patch applies only to the row looked up by company_id + wamid.
    // Different company rows are never selected by the persistence layer.
    const coA = row({ company_id: "co-a", provider_message_id: WAMID, status: "sent", sent_at: T0 });
    const coB = row({
      id: "rec-b",
      company_id: "co-b",
      provider_message_id: WAMID,
      status: "sent",
      sent_at: T0,
    });
    const patchA = computeCampaignReplyPatch(coA, { occurredAt: T3 });
    assert.equal(patchA?.replied_at, T3);
    // Company B row is unaffected unless separately looked up under co-b.
    assert.equal(coB.replied_at, null);
    assert.notEqual(coA.company_id, coB.company_id);
  });

  it("L) context.id belonging to non-campaign outbound (no provider_message_id on recipient)", () => {
    const current = row({ status: "queued", provider_message_id: null });
    assert.equal(computeCampaignReplyPatch(current, { occurredAt: T3 }), null);
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "delivered",
        occurredAt: T1,
      }),
      null,
    );
  });

  it("M) two campaigns for same customer remain independent", () => {
    const camp1 = row({
      id: "r1",
      provider_message_id: "wamid.camp1",
      status: "sent",
      sent_at: T0,
    });
    const camp2 = row({
      id: "r2",
      provider_message_id: "wamid.camp2",
      status: "queued",
    });
    const p1 = computeCampaignDeliveryStatusPatch(camp1, {
      status: "delivered",
      occurredAt: T1,
    });
    const p2 = computeCampaignSendSuccessPatch(camp2, {
      providerMessageId: "wamid.camp2",
      occurredAt: T1,
    });
    assert.equal(p1?.delivered_at, T1);
    assert.equal(p2?.status, "sent");
    assert.notEqual(camp1.id, camp2.id);
    assert.notEqual(camp1.provider_message_id, camp2.provider_message_id);
  });

  it("N) same provider_message_id across different companies stays isolated", () => {
    const a = row({ company_id: "co-a", provider_message_id: WAMID, status: "sent", sent_at: T0 });
    const b = row({
      id: "rec-other",
      company_id: "co-b",
      provider_message_id: WAMID,
      status: "sent",
      sent_at: T0,
    });
    const patchA = computeCampaignDeliveryStatusPatch(a, {
      status: "read",
      occurredAt: T2,
    });
    assert.ok(patchA?.read_at);
    assert.equal(b.read_at, null);
    assert.equal(a.company_id === b.company_id, false);
  });

  it("O) missing/invalid wamid", () => {
    assert.equal(
      computeCampaignSendSuccessPatch(row(), {
        providerMessageId: "  ",
        occurredAt: T0,
      }),
      null,
    );
    assert.equal(normalizeProviderMessageId(undefined), null);
  });

  it("P) recipient without provider_message_id ignores delivery webhooks", () => {
    const current = row({ status: "queued", provider_message_id: null });
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "delivered",
        occurredAt: T1,
      }),
      null,
    );
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "read",
        occurredAt: T2,
      }),
      null,
    );
    assert.equal(
      computeCampaignDeliveryStatusPatch(current, {
        status: "failed",
        occurredAt: T2,
      }),
      null,
    );
  });

  it("send success is idempotent when already sent with same wamid", () => {
    const current = row({
      status: "sent",
      provider_message_id: WAMID,
      sent_at: T0,
    });
    assert.equal(
      computeCampaignSendSuccessPatch(current, {
        providerMessageId: WAMID,
        occurredAt: T1,
      }),
      null,
    );
  });

  it("does not overwrite a different existing wamid", () => {
    const current = row({
      status: "sent",
      provider_message_id: "wamid.other",
      sent_at: T0,
    });
    assert.equal(
      computeCampaignSendSuccessPatch(current, {
        providerMessageId: WAMID,
        occurredAt: T1,
      }),
      null,
    );
  });

  it("safety: modules never use phone/last-9 or invent conversations", () => {
    const pure = readFileSync(
      join(__dirname, "campaign-delivery-reconciliation.ts"),
      "utf8",
    );
    const persist = readFileSync(
      join(__dirname, "reconcile-campaign-recipient-delivery.ts"),
      "utf8",
    );
    for (const src of [pure, persist]) {
      assert.doesNotMatch(src, /slice\(-9\)|lastNine|phone_e164|\.eq\("phone"/);
      assert.doesNotMatch(src, /createConversation|channel_delivery_events/);
      assert.doesNotMatch(src, /graph\.facebook|processQueue|executeCampaign/);
    }
    assert.match(persist, /eq\("company_id"/);
    assert.match(persist, /notification_queue_id/);
    assert.match(persist, /provider_message_id/);
  });

  it("wiring: WhatsAppProvider calls send reconcile; channel-platform has port", () => {
    const provider = readFileSync(
      join(
        __dirname,
        "../notifications/providers/whatsapp/services/whatsapp-provider.ts",
      ),
      "utf8",
    );
    assert.match(provider, /reconcileCampaignRecipientSendSuccess/);
    const router = readFileSync(
      join(
        __dirname,
        "../../../../../lib/channel-platform/src/router/channel-router.ts",
      ),
      "utf8",
    );
    assert.match(router, /campaignDeliveryReconciler/);
    assert.match(router, /reconcileDeliveryStatus/);
    const inbound = readFileSync(
      join(
        __dirname,
        "../../../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts",
      ),
      "utf8",
    );
    assert.match(inbound, /reconcileQuotedReply/);
  });
});
