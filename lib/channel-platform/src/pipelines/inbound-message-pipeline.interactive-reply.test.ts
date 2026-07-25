import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWhatsAppCloudAdapter } from "../adapters/whatsapp/whatsapp-cloud-adapter.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

const ctx = {
  companyChannel: {
    id: "company-channel-wa-interactive",
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

describe("InboundMessagePipeline interactive WhatsApp replies", () => {
  it("processes list replies without text.body and forwards reply metadata to automation", async () => {
    let automationInput: Record<string, unknown> | undefined;

    const env = createTestEnvironment({
      automationResponse: "Workflow resumed",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-interactive",
        automationFlowId: "flow-1",
      },
      companyChannel: ctx.companyChannel,
      adapters: [createWhatsAppCloudAdapter()],
      automationPort: {
        async startWorkflow(input) {
          automationInput = input;
          return {
            runId: "automation-run-list",
            responseContent: "Workflow resumed",
            lifecycle: "waiting_input",
            resumed: true,
          };
        },
      },
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: "201011404109",
      payload: {
        message: {
          from: "201011404109",
          id: "wamid.list-dr3",
          timestamp: "1710000000",
          type: "interactive",
          interactive: {
            type: "list_reply",
            list_reply: { id: "dr3", title: "Dr Three" },
          },
        },
      },
    });

    assert.equal(response.automationRunId, "automation-run-list");
    assert.ok(automationInput);
    assert.equal(automationInput.messageText, "Dr Three");
    assert.equal(automationInput.metadata?.replyId, "dr3");
    assert.equal(automationInput.metadata?.title, "Dr Three");
    assert.equal(automationInput.metadata?.kind, "interactive_reply");
    assert.equal(automationInput.metadata?.interactionType, "list_reply");
  });

  it("still rejects empty plain-text WhatsApp messages", async () => {
    const env = createTestEnvironment({
      companyChannel: ctx.companyChannel,
      adapters: [createWhatsAppCloudAdapter()],
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-interactive",
        automationFlowId: "flow-1",
      },
    });

    await assert.rejects(
      () =>
        env.router.routeInbound(createContext(), {
          companyId: "company-1",
          companyChannelId: ctx.companyChannel.id,
          channelKey: "whatsapp",
          source: "webhook",
          externalThreadId: "201011404109",
          payload: {
            message: {
              from: "201011404109",
              id: "wamid.empty-text",
              timestamp: "1710000000",
              type: "text",
              text: { body: "   " },
            },
          },
        }),
      /Inbound message must include text, media, or an interactive reply/,
    );
  });
});

describe("WhatsAppCloudAdapter list replies", () => {
  it("normalizes list replies with reply metadata and resolved text", () => {
    const adapter = createWhatsAppCloudAdapter();
    const normalized = adapter.normalizeInbound(ctx, {
      message: {
        from: "201011404109",
        id: "wamid.list-dr3",
        timestamp: "1710000000",
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "dr3", title: "Dr Three" },
        },
      },
    });

    assert.equal(normalized.text, "Dr Three");
    assert.equal(normalized.metadata?.replyId, "dr3");
    assert.equal(normalized.metadata?.interactionType, "list_reply");
  });

  it("falls back to list row id when title is absent", () => {
    const adapter = createWhatsAppCloudAdapter();
    const normalized = adapter.normalizeInbound(ctx, {
      message: {
        from: "201011404109",
        id: "wamid.list-id-only",
        timestamp: "1710000000",
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "dr3" },
        },
      },
    });

    assert.equal(normalized.text, "dr3");
    assert.equal(normalized.metadata?.replyId, "dr3");
  });
});
