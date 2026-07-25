import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWhatsAppCloudAdapter } from "../adapters/whatsapp/whatsapp-cloud-adapter.js";
import {
  buildWhatsAppAdapterClassificationLog,
} from "./whatsapp-webhook-ingress-debug.js";

const ctx = {
  companyChannel: {
    id: "cc-wa-1",
    companyId: "company-1",
    channelKey: "whatsapp",
    displayName: "WhatsApp",
    isEnabled: true,
    provider: "meta",
    configuration: {
      phoneNumberId: "123456789",
      accessToken: "test-token",
      verifyToken: "vault-verify-token",
    },
  },
};

describe("whatsapp webhook ingress debug", () => {
  it("classifies inbound messages before routing", () => {
    const adapter = createWhatsAppCloudAdapter();
    const rawPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456789" },
                messages: [
                  {
                    from: "201011404109",
                    id: "wamid.inbound-list",
                    timestamp: "1710000000",
                    type: "interactive",
                    interactive: {
                      type: "list_reply",
                      list_reply: { id: "dr3", title: "Dr Three" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const envelope = adapter.parseWebhook!(ctx, rawPayload);
    const log = buildWhatsAppAdapterClassificationLog({
      requestId: "req-123",
      rawPayload,
      envelope,
    });

    assert.equal(log.event, "whatsapp.adapter.classified");
    assert.equal(log.requestId, "req-123");
    assert.equal(log.eventType, "message.received");
    assert.equal(log.messageCount, 1);
    assert.equal(log.statusCount, 0);
    assert.deepEqual(log.parsedEventKinds, ["message"]);
    assert.equal(log.senderWaId, "201011404109");
    assert.equal(log.messageText, "Dr Three");
    assert.equal(log.externalMessageId, "wamid.inbound-list");
    assert.equal(log.routesToInboundPipeline, true);
    assert.equal(log.routesToDeliveryStatusPipeline, false);
  });

  it("classifies status webhooks as delivery-only", () => {
    const adapter = createWhatsAppCloudAdapter();
    const rawPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456789" },
                statuses: [
                  {
                    id: "wamid.outbound-1",
                    status: "read",
                    timestamp: "1710000001",
                    recipient_id: "201011404109",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const envelope = adapter.parseWebhook!(ctx, rawPayload);
    const log = buildWhatsAppAdapterClassificationLog({
      requestId: "req-456",
      rawPayload,
      envelope,
    });

    assert.equal(log.eventType, "message.read");
    assert.equal(log.messageCount, 0);
    assert.equal(log.statusCount, 1);
    assert.equal(log.routesToInboundPipeline, false);
    assert.equal(log.routesToDeliveryStatusPipeline, true);
    assert.equal(log.messageText, null);
  });
});
