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
const END_ID = "e1f2f3a4-b5c6-4789-abcd-ef1234567893";

const buttonFlowSnapshot: WorkflowGraphSnapshot = {
  name: "Legacy recovery flow",
  description: "",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    { id: TRIGGER_ID, type: "trigger", config: {}, positionX: 0, positionY: 0 },
    {
      id: BUTTONS_ID,
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose",
        buttons: [{ id: "book", label: "Book now" }],
      },
      positionX: 0,
      positionY: 120,
    },
    { id: END_ID, type: "end", config: {}, positionX: 0, positionY: 240 },
  ],
  edges: [
    { id: "t-b", sourceNodeId: TRIGGER_ID, targetNodeId: BUTTONS_ID, condition: {} },
    { id: "b-e", sourceNodeId: BUTTONS_ID, targetNodeId: END_ID, condition: {} },
  ],
};

function createChannelAutomationPortWithRecovery(
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

describe("legacy waiting WhatsApp inbound recovery", () => {
  it("abandons orphaned waiting_input rows with null current_node_id and starts a fresh workflow", async () => {
    const automationCtx = createVersionGraphTestContext();
    const automationEnv = createExecutionEnvironment();
    automationEnv.flow.status = "draft";
    await automationEnv.publish.publish(automationCtx, {
      flowId: automationEnv.flow.id,
      snapshot: buttonFlowSnapshot,
    });

    const started = await automationEnv.engine.start(automationCtx, {
      companyId: "company-1",
      flowId: automationEnv.flow.id,
      channel: "whatsapp",
      externalUserId: "201011404109",
      triggerSource: "inbound_message",
      initialVariables: { lastMessage: "Hello" },
    });
    assert.equal(started.lifecycle, "waiting_input");

    const legacyRun = automationEnv.runs.find((item) => item.id === started.run.id)!;
    const legacySession = automationEnv.sessions.find((item) => item.id === started.session.id)!;
    legacyRun.current_node_id = null;
    legacyRun.status = "waiting_input";
    legacySession.current_node_id = null;
    legacySession.status = "waiting_input";

    const whatsAppAdapter = createWhatsAppCloudAdapter({
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ messaging_product: "whatsapp", messages: [{ id: "wamid.outbound-legacy" }] }),
        }) as Response,
    });

    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-legacy",
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
      automationPort: createChannelAutomationPortWithRecovery(
        automationEnv.engine,
        automationCtx,
        automationEnv,
      ),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-legacy",
        automationFlowId: automationEnv.flow.id,
      },
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-legacy",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: "201011404109",
      externalMessageId: "wamid.inbound-legacy-recovery",
      payload: {
        message: {
          from: "201011404109",
          id: "wamid.inbound-legacy-recovery",
          timestamp: "1710000000",
          type: "text",
          text: { body: "Hello after legacy orphan" },
        },
      },
    });

    assert.equal(response.responseContent, "Choose");
    assert.notEqual(response.automationRunId, legacyRun.id);

    const abandoned = await automationEnv.runRepository.findById(legacyRun.id);
    assert.equal(abandoned?.status, "cancelled");
    assert.equal(abandoned?.current_node_id, null);

    const freshRun = await automationEnv.runRepository.findById(response.automationRunId!);
    assert.equal(freshRun?.status, "waiting_input");
    assert.ok(freshRun?.current_node_id);
    assert.equal(freshRun?.flow_version_id, "version-1");
  });
});
