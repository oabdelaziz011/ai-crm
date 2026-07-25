import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationEngine,
  buildResumeInput,
  canResumeWaitingRun,
  isStaleWaitingRun,
} from "@workspace/automation-platform";
import type { WorkflowGraphSnapshot } from "../../../automation-platform/src/lifecycle/types.js";
import { createWhatsAppCloudAdapter } from "../adapters/whatsapp/whatsapp-cloud-adapter.js";
import type { ChannelAutomationPort } from "../ports/channel-platform-ports.js";
import { extractAutomationOutboundMessages, extractAutomationResponseContent } from "../services/extract-automation-outbound.js";
import { createContext, createTestEnvironment } from "../test-utils.js";
import {
  createExecutionEnvironment,
  createVersionGraphTestContext,
} from "../../../automation-platform/src/lifecycle/test-execution-environment.js";

const TRIGGER_ID = "67a3b77c-6feb-446c-bbf3-5e98d2ea9665";
const BUTTONS_ID = "fb7ac8f1-16d8-42d9-9896-b748bf313f66";
const CONDITION_ID = "c1d2e3f4-a5b6-4789-abcd-ef1234567890";
const REPLY_YES_ID = "d1e2f3a4-b5c6-4789-abcd-ef1234567891";
const END_YES_ID = "e1f2f3a4-b5c6-4789-abcd-ef1234567893";

const whatsAppButtonFlowSnapshot: WorkflowGraphSnapshot = {
  name: "WhatsApp Channel Journey",
  description: "Channel inbound multi-step conversation",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    {
      id: TRIGGER_ID,
      type: "trigger",
      config: { builderType: "start" },
      positionX: 0,
      positionY: 0,
    },
    {
      id: BUTTONS_ID,
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose an option",
        buttons: [{ id: "booking", label: "Book now" }],
      },
      positionX: 0,
      positionY: 120,
    },
    {
      id: CONDITION_ID,
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "r1",
                field: "conversation.last_button_id",
                operator: "equals",
                value: "booking",
              },
            ],
          },
        },
      },
      positionX: 0,
      positionY: 240,
    },
    {
      id: REPLY_YES_ID,
      type: "action",
      config: {
        action: "send_message",
        message: "Thanks for booking via WhatsApp!",
      },
      positionX: 0,
      positionY: 360,
    },
    {
      id: END_YES_ID,
      type: "end",
      config: { builderType: "end" },
      positionX: 0,
      positionY: 480,
    },
  ],
  edges: [
    {
      id: "trigger->buttons",
      sourceNodeId: TRIGGER_ID,
      targetNodeId: BUTTONS_ID,
      condition: {},
    },
    {
      id: "buttons->condition",
      sourceNodeId: BUTTONS_ID,
      targetNodeId: CONDITION_ID,
      condition: {},
    },
    {
      id: "condition->reply",
      sourceNodeId: CONDITION_ID,
      targetNodeId: REPLY_YES_ID,
      condition: { branchKey: "yes" },
    },
    {
      id: "reply->end",
      sourceNodeId: REPLY_YES_ID,
      targetNodeId: END_YES_ID,
      condition: {},
    },
  ],
};

function createResumableChannelAutomationPort(
  engine: AutomationEngine,
  automationCtx: ReturnType<typeof createVersionGraphTestContext>,
  env: ReturnType<typeof createExecutionEnvironment>,
): ChannelAutomationPort {
  return {
    async startWorkflow(input) {
      const channel = input.channelKey === "whatsapp" ? "whatsapp" : "web_chat";
      const resumePayload = { ...(input.metadata ?? {}) };

      const session = await env.sessionRepository.findActiveSession({
        companyId: input.companyId,
        channel,
        externalUserId: input.externalUserId,
      });

      if (session?.flow_id === input.flowId) {
        const run = session.run_id
          ? await env.runRepository.findById(session.run_id)
          : await env.runRepository.findBySessionId(session.id);

        if (run && canResumeWaitingRun(session, run)) {
          const result = await engine.resume(automationCtx, {
            runId: run.id,
            input: buildResumeInput(run, input.messageText, resumePayload),
          });

          const outboundMessages = extractAutomationOutboundMessages(result);
          return {
            runId: result.run.id,
            responseContent: extractAutomationResponseContent(result) ?? undefined,
            outboundMessages,
            lifecycle: result.lifecycle,
            flowVersionId: result.run.flow_version_id ?? undefined,
            resumed: true,
          };
        }

        if (run && isStaleWaitingRun(session, run)) {
          await engine.abandonStaleWaitingRun(automationCtx, { runId: run.id });
        }
      }

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

      const outboundMessages = extractAutomationOutboundMessages(result);
      return {
        runId: result.run.id,
        responseContent: extractAutomationResponseContent(result) ?? undefined,
        outboundMessages,
        lifecycle: result.lifecycle,
        flowVersionId: result.run.flow_version_id ?? undefined,
        resumed: false,
      };
    },
  };
}

function whatsAppTextPayload(messageId: string, waUser: string, text: string) {
  return {
    message: {
      from: waUser,
      id: messageId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: text },
    },
    senderName: "Regression User",
    phoneNumberId: "123456789",
  };
}

function whatsAppButtonPayload(messageId: string, waUser: string) {
  return {
    message: {
      from: waUser,
      id: messageId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "booking", title: "Book now" },
      },
    },
    senderName: "Regression User",
    phoneNumberId: "123456789",
  };
}

describe("InboundMessagePipeline WhatsApp version graph E2E regression", () => {
  it("routes inbound → buttons → button press → resume → completion on pinned flow_version_id after draft edit", async () => {
    const automationCtx = createVersionGraphTestContext();
    const automationEnv = createExecutionEnvironment();
    automationEnv.flow.status = "draft";

    const published = await automationEnv.publish.publish(automationCtx, {
      flowId: automationEnv.flow.id,
      snapshot: whatsAppButtonFlowSnapshot,
    });
    const pinnedVersionId = published.version.id;

    const graphRequests: Array<{ url: string; body: unknown }> = [];
    const whatsAppAdapter = createWhatsAppCloudAdapter({
      fetchFn: async (url, init) => {
        graphRequests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            messages: [{ id: `wamid.outbound-${graphRequests.length}` }],
          }),
        } as Response;
      },
    });

    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        companyId: "company-1",
        channelKey: "whatsapp",
        displayName: "WhatsApp",
        provider: "meta",
        configuration: {
          phoneNumberId: "123456789",
          accessToken: "test-token",
          verifyToken: "vault-verify-token",
        },
      },
      adapters: [whatsAppAdapter],
      automationPort: createResumableChannelAutomationPort(
        automationEnv.engine,
        automationCtx,
        automationEnv,
      ),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-1",
        automationFlowId: automationEnv.flow.id,
      },
    });

    const channelCtx = createContext();
    const waUser = "201011404300";

    const first = await env.router.routeInbound(channelCtx, {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-1",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: waUser,
      externalMessageId: "wamid.inbound-start",
      payload: whatsAppTextPayload("wamid.inbound-start", waUser, "Hello"),
    });

    assert.equal(first.responseContent, "Choose an option");
    assert.equal(first.automationRunId, "run-1");
    assert.ok(first.outboundDeliveryId);

    const waitingRun = await automationEnv.runRepository.findById("run-1");
    const waitingSession = await automationEnv.sessionRepository.findById("session-1");
    assert.ok(waitingRun);
    assert.ok(waitingSession);
    assert.equal(waitingRun.status, "waiting_input");
    assert.equal(waitingRun.flow_version_id, pinnedVersionId);
    assert.equal(waitingSession.flow_version_id, pinnedVersionId);
    assert.equal(waitingRun.current_node_id, BUTTONS_ID);

    await automationEnv.nodeRepository.deleteByFlowId(automationEnv.flow.id);
    await automationEnv.edgeRepository.deleteByFlowId(automationEnv.flow.id);
    await automationEnv.nodeRepository.create({
      flowId: automationEnv.flow.id,
      type: "trigger",
      config: { builderType: "start", label: "Draft-only trigger" },
    });
    automationEnv.flow.has_unpublished_draft = true;

    const second = await env.router.routeInbound(channelCtx, {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-1",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: waUser,
      externalMessageId: "wamid.inbound-button",
      payload: whatsAppButtonPayload("wamid.inbound-button", waUser),
    });

    assert.equal(second.automationRunId, "run-1");
    assert.equal(second.responseContent, "Thanks for booking via WhatsApp!");
    assert.ok(second.outboundDeliveryId);
    assert.equal(graphRequests.length, 2);

    const completedRun = await automationEnv.runRepository.findById("run-1");
    const completedSession = await automationEnv.sessionRepository.findById("session-1");
    assert.ok(completedRun);
    assert.ok(completedSession);
    assert.equal(completedRun.status, "completed");
    assert.equal(completedSession.status, "completed");
    assert.equal(completedRun.flow_version_id, pinnedVersionId);
    assert.equal(completedSession.flow_version_id, pinnedVersionId);
    assert.equal(completedRun.current_node_id, END_YES_ID);
    assert.equal(completedRun.variables.__branch, "yes");
    assert.equal(
      (completedRun.variables.conversation as { last_button_id?: string }).last_button_id,
      "booking",
    );
    assert.equal(await automationEnv.versionGraph.hasNode(pinnedVersionId, END_YES_ID), true);
  });
});
