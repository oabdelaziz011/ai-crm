import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { DeliveryStatusPipeline } from "../pipelines/delivery-status-pipeline.js";
import type { ChannelDeliveryEventRecord } from "../types.js";
import { createContext } from "../test-utils.js";

describe("DeliveryStatusPipeline", () => {
  it("updates delivery status by external message id", async () => {
    const deliveryEvents: ChannelDeliveryEventRecord[] = [
      {
        id: "delivery-1",
        company_id: "company-1",
        company_channel_id: "cc-wa-1",
        channel_key: "whatsapp",
        conversation_id: "conv-1",
        channel_session_id: "session-1",
        outbound_message_id: "msg-out-1",
        external_thread_id: "15551234567",
        external_message_id: "wamid.outbound-1",
        delivery_status: "sent",
        attempt_count: 1,
        payload: {},
        provider_response: {},
        error_message: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const engine = new DeliveryTrackingEngine({
      createEvent: async () => deliveryEvents[0]!,
      updateEvent: async (input) => {
        Object.assign(deliveryEvents[0]!, {
          delivery_status: input.deliveryStatus,
          delivered_at: input.deliveredAt ?? deliveryEvents[0]!.delivered_at,
          read_at: input.readAt ?? deliveryEvents[0]!.read_at,
        });
        return deliveryEvents[0]!;
      },
      findById: async () => deliveryEvents[0] ?? null,
      findByExternalMessageId: async (_companyChannelId, externalMessageId) =>
        deliveryEvents.find((event) => event.external_message_id === externalMessageId) ?? null,
    });

    const pipeline = new DeliveryStatusPipeline(engine, {
      createEvent: async () => deliveryEvents[0]!,
      updateEvent: async (input) => {
        Object.assign(deliveryEvents[0]!, {
          delivery_status: input.deliveryStatus,
          delivered_at: input.deliveredAt ?? deliveryEvents[0]!.delivered_at,
        });
        return deliveryEvents[0]!;
      },
      findById: async () => deliveryEvents[0] ?? null,
      findByExternalMessageId: async (_companyChannelId, externalMessageId) =>
        deliveryEvents.find((event) => event.external_message_id === externalMessageId) ?? null,
    });

    const ctx = createContext();
    const result = await pipeline.process(ctx, {
      companyId: "company-1",
      companyChannelId: "cc-wa-1",
      externalMessageId: "wamid.outbound-1",
      status: "delivered",
    });

    assert.equal(result.updated, true);
    assert.equal(result.deliveryStatus, "delivered");
  });

  it("reconciles linked conversation_messages via confirmOutgoingDelivery without resending", async () => {
    const deliveryEvents: ChannelDeliveryEventRecord[] = [
      {
        id: "delivery-1",
        company_id: "company-1",
        company_channel_id: "cc-wa-1",
        channel_key: "whatsapp",
        conversation_id: "conv-1",
        channel_session_id: "session-1",
        outbound_message_id: "msg-out-1",
        external_thread_id: "15551234567",
        external_message_id: "wamid.outbound-1",
        delivery_status: "sent",
        attempt_count: 1,
        payload: {},
        provider_response: {},
        error_message: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const confirms: Array<{ messageId: string; status: string; externalMessageId?: string | null }> = [];
    const repo = {
      createEvent: async () => deliveryEvents[0]!,
      updateEvent: async (input: {
        deliveryStatus?: string;
        deliveredAt?: string | null;
        readAt?: string | null;
      }) => {
        Object.assign(deliveryEvents[0]!, {
          delivery_status: input.deliveryStatus ?? deliveryEvents[0]!.delivery_status,
          delivered_at: input.deliveredAt ?? deliveryEvents[0]!.delivered_at,
          read_at: input.readAt ?? deliveryEvents[0]!.read_at,
        });
        return deliveryEvents[0]!;
      },
      findById: async () => deliveryEvents[0] ?? null,
      findByExternalMessageId: async (_companyChannelId: string, externalMessageId: string) =>
        deliveryEvents.find((event) => event.external_message_id === externalMessageId) ?? null,
    };

    const engine = new DeliveryTrackingEngine(repo);
    const pipeline = new DeliveryStatusPipeline(engine, repo, async (input) => {
      confirms.push(input);
    });

    const result = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "cc-wa-1",
      externalMessageId: "wamid.outbound-1",
      status: "delivered",
    });

    assert.equal(result.updated, true);
    assert.equal(result.deliveryStatus, "delivered");
    assert.equal(result.conversationConfirmStatus, "confirmed");
    assert.equal(confirms.length, 1);
    assert.equal(confirms[0]?.messageId, "msg-out-1");
    assert.equal(confirms[0]?.status, "delivered");
    assert.equal(confirms[0]?.externalMessageId, "wamid.outbound-1");
  });

  it("protects terminal delivered from regressing to sent", async () => {
    const deliveryEvents: ChannelDeliveryEventRecord[] = [
      {
        id: "delivery-1",
        company_id: "company-1",
        company_channel_id: "cc-sms-1",
        channel_key: "sms",
        conversation_id: "conv-1",
        channel_session_id: "session-1",
        outbound_message_id: "msg-out-1",
        external_thread_id: "+15551234567",
        external_message_id: "SM-out-1",
        delivery_status: "delivered",
        attempt_count: 1,
        payload: {},
        provider_response: {},
        error_message: null,
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        read_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const repo = {
      createEvent: async () => deliveryEvents[0]!,
      updateEvent: async (input: { deliveryStatus?: string }) => {
        Object.assign(deliveryEvents[0]!, {
          delivery_status: input.deliveryStatus ?? deliveryEvents[0]!.delivery_status,
        });
        return deliveryEvents[0]!;
      },
      findById: async () => deliveryEvents[0] ?? null,
      findByExternalMessageId: async (_companyChannelId: string, externalMessageId: string) =>
        deliveryEvents.find((event) => event.external_message_id === externalMessageId) ?? null,
    };

    const engine = new DeliveryTrackingEngine(repo);
    const pipeline = new DeliveryStatusPipeline(engine, repo);

    const result = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "cc-sms-1",
      externalMessageId: "SM-out-1",
      status: "sent",
    });

    assert.equal(result.updated, true);
    assert.equal(result.deliveryStatus, "delivered");
    assert.equal(deliveryEvents[0]!.delivery_status, "delivered");
  });

  it("unknown SID does not invent a delivery row", async () => {
    const repo = {
      createEvent: async () => {
        throw new Error("must not create");
      },
      updateEvent: async () => {
        throw new Error("must not update");
      },
      findById: async () => null,
      findByExternalMessageId: async () => null,
    };
    const engine = new DeliveryTrackingEngine(repo);
    const pipeline = new DeliveryStatusPipeline(engine, repo);
    const result = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "cc-sms-1",
      externalMessageId: "SM-unknown",
      status: "delivered",
    });
    assert.equal(result.updated, false);
    assert.equal(result.reason, "delivery_not_found");
  });
});
