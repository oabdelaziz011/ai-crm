import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { demoBookingShouldSyncCrm, advanceLeadToDemoScheduled } from "./sales-demo-crm-lifecycle.js";
import {
  qualifyOpenLeadFromCustomerTurn,
  shouldApplyAutomaticSalesQualification,
} from "./conversation-sales-qualification.js";
import { PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS } from "./public-web-chat/public-web-chat-tool-policy.js";

describe("automatic sales qualification gate", () => {
  it("skips public web chat and a human-owned conversation", () => {
    assert.equal(
      shouldApplyAutomaticSalesQualification({
        pageContext: { publicWebChat: true },
        gateAllowsAutomatedReply: true,
      }).reason,
      "public_web_chat",
    );
    assert.equal(
      shouldApplyAutomaticSalesQualification({
        pageContext: {},
        gateAllowsAutomatedReply: false,
      }).reason,
      "human_or_paused_ownership",
    );
    assert.equal(
      shouldApplyAutomaticSalesQualification({
        pageContext: {},
        publicWebChatConversation: true,
        gateAllowsAutomatedReply: true,
      }).reason,
      "public_web_chat",
    );
  });

  it("does not call qualification when the gate or the public channel blocks it", async () => {
    let calls = 0;
    const skipped = await qualifyOpenLeadFromCustomerTurn({
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "I want to buy Aurora Studio",
      actorUserId: "user-1",
      pageContext: { publicWebChat: true },
      gateAllowsAutomatedReply: true,
      loadCustomerTexts: async () => [],
      findLeadId: async () => "lead-1",
      apply: async () => {
        calls += 1;
      },
    });
    const handedOff = await qualifyOpenLeadFromCustomerTurn({
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "I want to buy Aurora Studio",
      actorUserId: "user-1",
      gateAllowsAutomatedReply: false,
      loadCustomerTexts: async () => [],
      findLeadId: async () => "lead-1",
      apply: async () => {
        calls += 1;
      },
    });
    assert.equal(skipped, "skipped");
    assert.equal(handedOff, "skipped");
    assert.equal(calls, 0);
  });

  it("uses the shared qualification turn on the API and login channel runtimes", () => {
    const apiRuntime = readFileSync(new URL("../platform/channel-platform-ports.ts", import.meta.url), "utf8");
    const loginRuntime = readFileSync(
      new URL("../../../login-app/src/lib/channel-platform/platform-ports.ts", import.meta.url),
      "utf8",
    );
    const loginTurn = readFileSync(
      new URL("../../../login-app/src/lib/channel-platform/conversation-sales-qualification-turn.ts", import.meta.url),
      "utf8",
    );
    assert.equal(apiRuntime.includes("createConversationSalesQualificationTurn"), true);
    assert.equal(loginRuntime.includes("createConversationSalesQualificationTurn"), true);
    assert.equal(loginTurn.includes("conversationIsPublicWebWidget"), true);
    assert.equal(loginTurn.includes("qualifyOpenLeadFromCustomerTurn"), true);
    const apiTurn = readFileSync(new URL("./conversation-sales-qualification.ts", import.meta.url), "utf8");
    assert.match(apiTurn, /createLoginAppLeadPlatformServices/);
    assert.match(loginTurn, /createLoginAppLeadPlatformServices/);
    assert.match(apiTurn, /preserveTrustedConversationCustomer/);
    assert.match(loginTurn, /preserveTrustedConversationCustomer/);
    assert.doesNotMatch(apiTurn, /createLeadPlatformServices\(client\)/);
    assert.doesNotMatch(loginTurn, /createLeadPlatformServices\(client\)/);
  });

  it("keeps public web chat off demo, quote, and qualification tools", () => {
    const allowed = new Set<string>(PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS);
    for (const toolKey of [
      "qualify_lead",
      "create_demo_booking",
      "create_draft_quote",
      "request_send_quote",
      "search_products",
      "get_product_details",
    ]) {
      assert.equal(allowed.has(toolKey), false, toolKey);
    }
  });
});

describe("demo booking CRM sync", () => {
  it("does not sync a failed booking and does not book twice when already scheduled", async () => {
    assert.equal(demoBookingShouldSyncCrm({ success: false, bookingId: "bk-1", customerId: "cust-1" }), false);
    assert.equal(demoBookingShouldSyncCrm({ success: true, bookingId: null, customerId: "cust-1" }), false);
    assert.equal(demoBookingShouldSyncCrm({ success: true, bookingId: "bk-1", customerId: "cust-1" }), true);

    let stageChanges = 0;
    const platform = {
      queries: {
        async getLead() {
          return { lead: { id: "lead-1", lifecycleStatus: "demo_scheduled" } };
        },
      },
      commands: {
        async changeLeadStage() {
          stageChanges += 1;
          throw new Error("already scheduled must not change stage");
        },
      },
    };
    const result = await advanceLeadToDemoScheduled(
      platform as never,
      { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      { id: "lead-1", lifecycleStatus: "demo_scheduled", pipelineId: "pipe-1" },
    );
    assert.equal(result.already, true);
    assert.equal(stageChanges, 0);
  });
});

describe("quote draft does not mean proposal sent", () => {
  it("keeps draft and request-send out of the CRM stage sync", () => {
    const turn = readFileSync(
      fileURLToPath(new URL("../../../../lib/ai-execution-engine/src/runtime/sales-conversation-turn.ts", import.meta.url)),
      "utf8",
    );
    const sync = readFileSync(fileURLToPath(new URL("./quote-send/quote-send-crm-sync.ts", import.meta.url)), "utf8");
    assert.equal(turn.includes("proposal_sent"), false);
    assert.equal(turn.includes("changeLeadStage"), false);
    assert.match(sync, /confirmed_quote_send/);
    assert.match(sync, /source: "system"/);
  });
});
