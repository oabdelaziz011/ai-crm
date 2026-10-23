import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { DeliveryStatusPipeline } from "../pipelines/delivery-status-pipeline.js";
import type { ChannelDeliveryEventRecord } from "../types.js";
import type { UpdateDeliveryEventInput } from "../repositories/channel-platform-repositories.js";
import { createContext } from "../test-utils.js";

describe("DeliveryStatusPipeline pending provider id", () => {
  it("applies a later sent then delivered receipt without sending", async () => {
    const sends: string[] = [];
    const delivery: ChannelDeliveryEventRecord = {
      id: "delivery-pending-1",
      company_id: "company-1",
      company_channel_id: "cc-isolated",
      channel_key: "whatsapp",
      conversation_id: "conv-isolated",
      channel_session_id: "session-isolated",
      outbound_message_id: "msg-isolated",
      external_thread_id: "15550001111",
      external_message_id: "wamid.isolated-accepted",
      delivery_status: "pending",
      attempt_count: 1,
      payload: { text: "isolated" },
      provider_response: { fake: true },
      error_message: "provider_accepted_local_confirm_pending",
      sent_at: null,
      delivered_at: null,
      read_at: null,
      failed_at: null,
      created_at: "2026-10-21T08:00:00.000Z",
      updated_at: "2026-10-21T08:00:00.000Z",
    };
    const confirms: string[] = [];
    const repo = {
      async createEvent() {
        sends.push("create");
        return delivery;
      },
      async updateEvent(input: UpdateDeliveryEventInput) {
        Object.assign(delivery, {
          delivery_status: input.deliveryStatus ?? delivery.delivery_status,
          external_message_id: input.externalMessageId ?? delivery.external_message_id,
          sent_at: input.sentAt ?? delivery.sent_at,
          delivered_at: input.deliveredAt ?? delivery.delivered_at,
          read_at: input.readAt ?? delivery.read_at,
          failed_at: input.failedAt ?? delivery.failed_at,
          updated_at: "2026-10-21T08:05:00.000Z",
        });
        return delivery;
      },
      async findById() {
        return delivery;
      },
      async findByExternalMessageId(_companyChannelId: string, externalMessageId: string) {
        return delivery.external_message_id === externalMessageId ? delivery : null;
      },
    };
    const pipeline = new DeliveryStatusPipeline(new DeliveryTrackingEngine(repo), repo, async (input) => {
      confirms.push(input.status);
    });

    const sent = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "cc-isolated",
      externalMessageId: "wamid.isolated-accepted",
      status: "sent",
    });
    assert.equal(sent.updated, true);
    assert.equal(sent.deliveryStatus, "sent");
    assert.equal(delivery.delivery_status, "sent");
    assert.ok(delivery.sent_at);

    const delivered = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "cc-isolated",
      externalMessageId: "wamid.isolated-accepted",
      status: "delivered",
    });
    assert.equal(delivered.updated, true);
    assert.equal(delivered.deliveryStatus, "delivered");
    assert.equal(delivery.delivery_status, "delivered");
    assert.ok(delivery.delivered_at);
    assert.deepEqual(confirms, ["sent", "delivered"]);
    assert.deepEqual(sends, []);
  });
});
