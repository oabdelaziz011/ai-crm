import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationEngine } from "@workspace/automation-platform";
import type { WorkflowGraphSnapshot } from "../../../automation-platform/src/lifecycle/types.js";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import type { ChannelAutomationPort } from "../ports/channel-platform-ports.js";
import { extractAutomationOutboundMessages, extractAutomationResponseContent } from "../services/extract-automation-outbound.js";
import { createContext, createTestEnvironment } from "../test-utils.js";
import {
  createExecutionEnvironment,
  createVersionGraphTestContext,
} from "../../../automation-platform/src/lifecycle/test-execution-environment.js";

const TRIGGER_ID = "11111111-1111-4111-8111-111111111111";
const WELCOME_ID = "22222222-2222-4222-8222-222222222222";
const BUTTONS_ID = "33333333-3333-4333-8333-333333333333";
const END_ID = "44444444-4444-4444-8444-444444444444";

const multiMessageFlowSnapshot: WorkflowGraphSnapshot = {
  name: "Multi outbound",
  description: "",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    { id: TRIGGER_ID, type: "trigger", config: {}, positionX: 0, positionY: 0 },
    {
      id: WELCOME_ID,
      type: "action",
      config: { action: "send_message", message: "اهلا بيك يا فندم" },
      positionX: 0,
      positionY: 120,
    },
    {
      id: BUTTONS_ID,
      type: "action",
      config: {
        action: "send_buttons",
        message: "please press on what you want",
        buttons: [{ id: "book", label: "Book Appointment" }],
      },
      positionX: 0,
      positionY: 240,
    },
    { id: END_ID, type: "end", config: {}, positionX: 0, positionY: 360 },
  ],
  edges: [
    { id: "t-w", sourceNodeId: TRIGGER_ID, targetNodeId: WELCOME_ID, condition: {} },
    { id: "w-b", sourceNodeId: WELCOME_ID, targetNodeId: BUTTONS_ID, condition: {} },
    { id: "b-e", sourceNodeId: BUTTONS_ID, targetNodeId: END_ID, condition: {} },
  ],
};

function createAutomationPort(
  engine: AutomationEngine,
  automationCtx: ReturnType<typeof createVersionGraphTestContext>,
): ChannelAutomationPort {
  return {
    async startWorkflow(input) {
      const channel = input.channelKey === "web_chat" ? "web_chat" : "whatsapp";
      const result = await engine.start(automationCtx, {
        companyId: input.companyId,
        flowId: input.flowId,
        channel,
        externalUserId: input.externalUserId,
        triggerSource: "inbound_message",
        initialVariables: {
          ...(input.initialVariables ?? {}),
          ...(input.metadata ?? {}),
        },
      });

      return {
        runId: result.run.id,
        responseContent: extractAutomationResponseContent(result) ?? undefined,
        outboundMessages: extractAutomationOutboundMessages(result),
        lifecycle: result.lifecycle,
        flowVersionId: result.run.flow_version_id ?? undefined,
        resumed: false,
      };
    },
  };
}

describe("InboundMessagePipeline multi outbound dispatch", () => {
  it("dispatches all queued workflow messages in order for web_chat", async () => {
    const automationCtx = createVersionGraphTestContext();
    const automationEnv = createExecutionEnvironment();
    automationEnv.flow.status = "draft";
    await automationEnv.publish.publish(automationCtx, {
      flowId: automationEnv.flow.id,
      snapshot: multiMessageFlowSnapshot,
    });

    const webChatAdapter = createStubWebChatAdapter();

    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-web-1",
        companyId: "company-1",
        channelKey: "web_chat",
        displayName: "Web Chat",
        provider: "stub",
        configuration: {},
      },
      adapters: [webChatAdapter],
      automationPort: createAutomationPort(automationEnv.engine, automationCtx),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-web-1",
        automationFlowId: automationEnv.flow.id,
      },
    });

    const result = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-web-1",
      channelKey: "web_chat",
      source: "webhook",
      externalThreadId: "user-1",
      externalMessageId: "msg-1",
      payload: { text: "Hello" },
    });

    assert.deepEqual(
      env.deliveryEvents.map((event) => (event.payload as { text?: string }).text),
      ["اهلا بيك يا فندم", "please press on what you want"],
    );
    assert.equal(result.outboundDeliveryIds?.length, 2);
    assert.equal(result.responseContent, "please press on what you want");
  });

  it("persists incoming and automation replies with linked delivery events and no duplicates", async () => {
    const automationCtx = createVersionGraphTestContext();
    const automationEnv = createExecutionEnvironment();
    automationEnv.flow.status = "draft";
    await automationEnv.publish.publish(automationCtx, {
      flowId: automationEnv.flow.id,
      snapshot: multiMessageFlowSnapshot,
    });

    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-web-1",
        companyId: "company-1",
        channelKey: "web_chat",
        displayName: "Web Chat",
        provider: "stub",
        configuration: {},
      },
      automationPort: createAutomationPort(automationEnv.engine, automationCtx),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-web-1",
        automationFlowId: automationEnv.flow.id,
      },
    });

    const result = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-web-1",
      channelKey: "web_chat",
      source: "webhook",
      externalThreadId: "user-1",
      externalMessageId: "msg-1",
      payload: { text: "Hello" },
    });

    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.incomingMessages[0]?.content, "Hello");
    assert.equal(env.outgoingMessages.length, 2);
    assert.deepEqual(
      env.outgoingMessages.map((message) => message.content),
      ["اهلا بيك يا فندم", "please press on what you want"],
    );
    assert.equal(env.deliveryEvents.length, 2);
    assert.equal(env.deliveryEvents[0]?.outbound_message_id, env.outgoingMessages[0]?.id);
    assert.equal(env.deliveryEvents[1]?.outbound_message_id, env.outgoingMessages[1]?.id);
    assert.equal(env.deliveryEvents[0]?.delivery_status, "sent");
    assert.equal(env.deliveryEvents[1]?.delivery_status, "sent");
    assert.equal(result.outboundDeliveryIds?.length, 2);
    assert.equal(env.incomingMessages.length + env.outgoingMessages.length, 3);
  });
});
