import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationEngine,
  buildResumeInput,
  resolveInboundAutomationRoute,
} from "@workspace/automation-platform";
import type { WorkflowGraphSnapshot } from "../../../automation-platform/src/lifecycle/types.js";
import { createWhatsAppCloudAdapter } from "../adapters/whatsapp/whatsapp-cloud-adapter.js";
import type { ChannelAutomationPort } from "../ports/channel-platform-ports.js";
import {
  extractAutomationOutboundMessages,
  extractAutomationResponseContent,
} from "../services/extract-automation-outbound.js";
import { createContext, createTestEnvironment } from "../test-utils.js";
import {
  createExecutionEnvironment,
  createVersionGraphTestContext,
} from "../../../automation-platform/src/lifecycle/test-execution-environment.js";

const TRIGGER_ID = "67a3b77c-6feb-446c-bbf3-5e98d2ea9665";
const LIST_ID = "fb7ac8f1-16d8-42d9-9896-b748bf313f66";
const WAIT_ID = "c1d2e3f4-a5b6-4789-abcd-ef1234567890";
const REPLY_ID = "d1e2f3a4-b5c6-4789-abcd-ef1234567891";
const END_ID = "e1f2f3a4-b5c6-4789-abcd-ef1234567893";

const listWaitFlowSnapshot: WorkflowGraphSnapshot = {
  name: "List then wait",
  description: "",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    { id: TRIGGER_ID, type: "trigger", config: { builderType: "start" }, positionX: 0, positionY: 0 },
    {
      id: LIST_ID,
      type: "action",
      config: {
        action: "send_list",
        title: "Choose a doctor",
        body: "Pick one",
        buttonLabel: "Doctors",
        sections: [{ title: "Doctors", rows: [{ id: "dr3", title: "Dr Three" }] }],
      },
      positionX: 0,
      positionY: 120,
    },
    {
      id: WAIT_ID,
      type: "action",
      config: { action: "wait_for_reply", prompt: "Tell us more" },
      positionX: 0,
      positionY: 240,
    },
    {
      id: REPLY_ID,
      type: "action",
      config: { action: "send_message", message: "Thanks for the details." },
      positionX: 0,
      positionY: 360,
    },
    { id: END_ID, type: "end", config: { builderType: "end" }, positionX: 0, positionY: 480 },
  ],
  edges: [
    { id: "t-l", sourceNodeId: TRIGGER_ID, targetNodeId: LIST_ID, condition: {} },
    { id: "l-w", sourceNodeId: LIST_ID, targetNodeId: WAIT_ID, condition: {} },
    { id: "w-r", sourceNodeId: WAIT_ID, targetNodeId: REPLY_ID, condition: {} },
    { id: "r-e", sourceNodeId: REPLY_ID, targetNodeId: END_ID, condition: {} },
  ],
};

function createProductionLikeAutomationPort(
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
      const run = session
        ? session.run_id
          ? await env.runRepository.findById(session.run_id)
          : await env.runRepository.findBySessionId(session.id)
        : null;

      const route = resolveInboundAutomationRoute({
        boundFlowId: input.flowId,
        session,
        run,
      });

      if (route.mode === "resume" && session && run) {
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

      if (route.mode === "abandon_and_start" && run) {
        await engine.abandonStaleWaitingRun(automationCtx, { runId: run.id });
      }

      if (route.mode === "hold_active_session") {
        return {
          runId: run?.id ?? session?.run_id ?? "",
          lifecycle: run?.status ?? session?.status,
          flowVersionId: run?.flow_version_id ?? session?.flow_version_id ?? undefined,
          resumed: false,
        };
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

function whatsAppListPayload(messageId: string, user: string) {
  return {
    message: {
      from: user,
      id: messageId,
      timestamp: "1710000000",
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: { id: "dr3", title: "Dr Three" },
      },
    },
  };
}

function whatsAppTextPayload(messageId: string, user: string, text: string) {
  return {
    message: {
      from: user,
      id: messageId,
      timestamp: "1710000000",
      type: "text",
      text: { body: text },
    },
  };
}

describe("WhatsApp list session lifecycle", () => {
  it("continues the same run when free text arrives after list selection", async () => {
    const automationCtx = createVersionGraphTestContext();
    const automationEnv = createExecutionEnvironment();
    automationEnv.flow.status = "draft";
    await automationEnv.publish.publish(automationCtx, {
      flowId: automationEnv.flow.id,
      snapshot: listWaitFlowSnapshot,
    });

    const whatsAppAdapter = createWhatsAppCloudAdapter({
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ messaging_product: "whatsapp", messages: [{ id: "wamid.outbound-list" }] }),
        }) as Response,
    });

    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-list",
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
      automationPort: createProductionLikeAutomationPort(
        automationEnv.engine,
        automationCtx,
        automationEnv,
      ),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-list",
        automationFlowId: automationEnv.flow.id,
      },
    });

    const waUser = "201011404109";
    const first = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-list",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: waUser,
      externalMessageId: "wamid.inbound-start",
      payload: whatsAppTextPayload("wamid.inbound-start", waUser, "Hello"),
    });

    assert.match(first.responseContent ?? "", /Pick one|Choose a doctor/i);
    const firstRunId = first.automationRunId;
    assert.ok(firstRunId);

    const second = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-list",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: waUser,
      externalMessageId: "wamid.inbound-list",
      payload: whatsAppListPayload("wamid.inbound-list", waUser),
    });

    assert.equal(second.automationRunId, firstRunId);
    assert.match(second.responseContent ?? "", /Tell us more/i);

    const waitingRun = await automationEnv.runRepository.findById(firstRunId!);
    assert.equal(waitingRun?.status, "waiting_input");
    assert.equal(waitingRun?.current_node_id, WAIT_ID);
    assert.equal(waitingRun?.variables.__waitingFor, "input");

    const third = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-list",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: waUser,
      externalMessageId: "wamid.inbound-followup",
      payload: whatsAppTextPayload("wamid.inbound-followup", waUser, "Hello"),
    });

    assert.equal(third.automationRunId, firstRunId);
    assert.match(third.responseContent ?? "", /Thanks for the details/i);
    assert.notEqual(third.responseContent ?? "", first.responseContent);
  });
});
