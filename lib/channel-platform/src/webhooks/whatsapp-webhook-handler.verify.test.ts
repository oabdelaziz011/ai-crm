import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWhatsAppWebhookHandler } from "./whatsapp-webhook-handler.js";

describe("WhatsAppWebhookHandler verifyGetByVerifyToken", () => {
  it("returns 200 when exactly one channel matches the verify token", async () => {
    const handler = createWhatsAppWebhookHandler({
      client: {} as never,
      services: {} as never,
      ports: {
        registry: {
          findCompanyChannelsByWhatsAppVerifyToken: async () => [{ id: "cc-1", companyId: "co-1" }],
        },
      } as never,
      resolveSystemContext: () => ({}) as never,
      resolveCompanyChannel: async () => ({ companyId: "co-1", verifyToken: "tok" }),
    });

    const result = await handler.verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "challenge-123",
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, "challenge-123");
  });

  it("returns 403 when zero or multiple channels match", async () => {
    const zero = createWhatsAppWebhookHandler({
      client: {} as never,
      services: {} as never,
      ports: {
        registry: {
          findCompanyChannelsByWhatsAppVerifyToken: async () => [],
        },
      } as never,
      resolveSystemContext: () => ({}) as never,
      resolveCompanyChannel: async () => ({ companyId: "co-1", verifyToken: "tok" }),
    });
    assert.equal(
      (
        await zero.verifyGetByVerifyToken({
          "hub.mode": "subscribe",
          "hub.verify_token": "tok",
          "hub.challenge": "x",
        })
      ).status,
      403,
    );

    const many = createWhatsAppWebhookHandler({
      client: {} as never,
      services: {} as never,
      ports: {
        registry: {
          findCompanyChannelsByWhatsAppVerifyToken: async () => [
            { id: "cc-1", companyId: "co-1" },
            { id: "cc-2", companyId: "co-1" },
          ],
        },
      } as never,
      resolveSystemContext: () => ({}) as never,
      resolveCompanyChannel: async () => ({ companyId: "co-1", verifyToken: "tok" }),
    });
    assert.equal(
      (
        await many.verifyGetByVerifyToken({
          "hub.mode": "subscribe",
          "hub.verify_token": "tok",
          "hub.challenge": "x",
        })
      ).status,
      403,
    );
  });
});
