import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPublicWebChatInboundPort,
  isPublicWebChatHumanOwned,
} from "./public-web-chat-inbound-port.js";

describe("isPublicWebChatHumanOwned", () => {
  it("treats blocked automation as human-owned", () => {
    assert.equal(isPublicWebChatHumanOwned({ allowAutomatedReply: false, reason: "owner_queue" }), true);
  });

  it("treats unassigned escalation follow-up as human-owned for visitor notices", () => {
    assert.equal(
      isPublicWebChatHumanOwned({
        allowAutomatedReply: true,
        reason: "waiting_unassigned_follow_up",
      }),
      true,
    );
  });

  it("does not treat default AI allow as human-owned", () => {
    assert.equal(isPublicWebChatHumanOwned({ allowAutomatedReply: true, reason: "default_allow" }), false);
    assert.equal(isPublicWebChatHumanOwned({ allowAutomatedReply: true, reason: "owner_ai_employee" }), false);
    assert.equal(isPublicWebChatHumanOwned(null), false);
  });
});

describe("createPublicWebChatInboundPort.isHumanOwned", () => {
  it("returns false when no automation gate is wired", async () => {
    const port = createPublicWebChatInboundPort({
      router: { routeInbound: async () => ({ incomingMessageId: null, responseContent: null }) },
      systemContext: { userId: null, companyId: null, isSuperAdmin: true, hasPermission: () => true },
      automationGate: null,
      handoffService: { requestCustomerHandoff: async () => ({ ownership: {} as never, assigned: false, queued: false }) },
    });
    assert.equal(await port.isHumanOwned({ companyId: "c", conversationId: "v" }), false);
  });

  it("maps waiting_unassigned_follow_up to human-owned", async () => {
    const port = createPublicWebChatInboundPort({
      router: { routeInbound: async () => ({ incomingMessageId: null, responseContent: null }) },
      systemContext: { userId: null, companyId: null, isSuperAdmin: true, hasPermission: () => true },
      automationGate: {
        evaluate: async () => ({
          allowAutomatedReply: true,
          reason: "waiting_unassigned_follow_up",
        }),
      },
      handoffService: { requestCustomerHandoff: async () => ({ ownership: {} as never, assigned: false, queued: false }) },
    });
    assert.equal(await port.isHumanOwned({ companyId: "c", conversationId: "v" }), true);
  });
});
