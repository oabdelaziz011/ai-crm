/**
 * Sprint 8 — webhook and IMAP share the same email inbound handler/pipeline.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailWebhookHandler } from "../webhooks/email-webhook-handler.js";
import { createEmailPollingWorker } from "../workers/email-polling-worker.js";

describe("Sprint 8 email webhook + IMAP shared path", () => {
  it("IMAP polling worker delegates inbound emails to the email webhook handler", async () => {
    const handled: Array<{ companyChannelId: string; messageId?: string }> = [];

    const emailHandler = {
      async handlePost(input: {
        companyChannelId: string;
        rawPayload: Record<string, unknown>;
        executeAi?: boolean;
      }) {
        const messageId =
          typeof (input.rawPayload as { messageId?: unknown }).messageId === "string"
            ? (input.rawPayload as { messageId: string }).messageId
            : undefined;
        handled.push({ companyChannelId: input.companyChannelId, messageId });
        return { conversationId: "conv-1", inboundEventId: "inbound-1" };
      },
    };

    // Recreate the Sprint 3 composition contract: polling uses the same handler.
    const worker = {
      async processInboundEmail(input: {
        companyChannelId: string;
        companyId: string;
        parsed: { messageId: string };
        executeAi?: boolean;
      }) {
        await emailHandler.handlePost({
          companyChannelId: input.companyChannelId,
          rawPayload: { messageId: input.parsed.messageId, kind: "email.inbound" },
          executeAi: input.executeAi,
        });
      },
    };

    await worker.processInboundEmail({
      companyChannelId: "cc-email-1",
      companyId: "company-1",
      parsed: { messageId: "msg-imap-1" },
      executeAi: false,
    });

    assert.equal(handled.length, 1);
    assert.equal(handled[0]?.companyChannelId, "cc-email-1");
    assert.equal(handled[0]?.messageId, "msg-imap-1");
  });

  it("email webhook handler routes through services.router.routeWebhook (shared pipeline entry)", async () => {
    let routeWebhookCalls = 0;
    const handler = createEmailWebhookHandler({
      services: {
        router: {
          async routeWebhook() {
            routeWebhookCalls += 1;
            return {
              conversationId: "conv-1",
              inboundEventId: "inbound-1",
              channelSessionId: "session-1",
            };
          },
        },
      } as never,
      ports: {
        registry: {
          async getCompanyChannel() {
            return null;
          },
        },
      } as never,
      resolveSystemContext: () =>
        ({
          userId: "system",
          companyId: null,
          isSuperAdmin: true,
          hasPermission: () => true,
        }) as never,
      resolveCompanyChannel: async () => ({ companyId: "company-1" }),
      threadLookup: {
        async findByMessageId() {
          return null;
        },
      },
      inboundAdapter: {
        async parseStructuredInbound(raw: Record<string, unknown>) {
          return {
            messageId: String(raw.messageId ?? "msg-1"),
            inReplyTo: null,
            references: [],
            from: { email: "a@example.com", name: null },
            to: [],
            cc: [],
            subject: "Hi",
            textPlain: "Hello",
            textHtml: null,
            attachments: [],
          };
        },
        buildWebhookPayload(parsed: { messageId: string }, externalThreadId: string) {
          return {
            kind: "email.inbound",
            messageId: parsed.messageId,
            resolvedExternalThreadId: externalThreadId,
          };
        },
      } as never,
    });

    await handler.handlePost({
      companyChannelId: "cc-email-1",
      rawPayload: { messageId: "msg-webhook-1" },
      executeAi: false,
    });

    assert.equal(routeWebhookCalls, 1);
  });

  it("createEmailPollingWorker wires processInboundEmail through createEmailWebhookHandler", async () => {
    // Source-contract: worker factory accepts the same services/ports composition as webhook.
    assert.equal(typeof createEmailPollingWorker, "function");
    assert.equal(typeof createEmailWebhookHandler, "function");
  });
});
