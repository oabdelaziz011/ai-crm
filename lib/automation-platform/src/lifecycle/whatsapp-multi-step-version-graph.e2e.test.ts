import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowGraphSnapshot } from "./types.js";
import {
  createExecutionEnvironment,
  createVersionGraphTestContext,
} from "./test-execution-environment.js";

const TRIGGER_ID = "67a3b77c-6feb-446c-bbf3-5e98d2ea9665";
const BUTTONS_ID = "fb7ac8f1-16d8-42d9-9896-b748bf313f66";
const CONDITION_ID = "c1d2e3f4-a5b6-4789-abcd-ef1234567890";
const REPLY_YES_ID = "d1e2f3a4-b5c6-4789-abcd-ef1234567891";
const END_YES_ID = "e1f2f3a4-b5c6-4789-abcd-ef1234567892";
const END_NO_ID = "f1e2f3a4-b5c6-4789-abcd-ef1234567893";

const whatsAppButtonFlowSnapshot: WorkflowGraphSnapshot = {
  name: "WhatsApp Button Journey",
  description: "Multi-step inbound conversation",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    {
      id: TRIGGER_ID,
      type: "trigger",
      config: { builderType: "start", label: "When someone messages you" },
      positionX: 0,
      positionY: 0,
    },
    {
      id: BUTTONS_ID,
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose an option",
        buttons: [
          { id: "booking", label: "Book now" },
          { id: "support", label: "Get support" },
        ],
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
        message: "Thanks for booking! We will confirm shortly.",
      },
      positionX: -120,
      positionY: 360,
    },
    {
      id: END_YES_ID,
      type: "end",
      config: { builderType: "end", label: "booking-complete" },
      positionX: -120,
      positionY: 480,
    },
    {
      id: END_NO_ID,
      type: "end",
      config: { builderType: "end", label: "support-complete" },
      positionX: 120,
      positionY: 360,
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
      id: "condition->reply-yes",
      sourceNodeId: CONDITION_ID,
      targetNodeId: REPLY_YES_ID,
      condition: { branchKey: "yes" },
    },
    {
      id: "reply-yes->end-yes",
      sourceNodeId: REPLY_YES_ID,
      targetNodeId: END_YES_ID,
      condition: {},
    },
    {
      id: "condition->end-no",
      sourceNodeId: CONDITION_ID,
      targetNodeId: END_NO_ID,
      condition: { branchKey: "no" },
    },
  ],
};

function assertSameFlowVersion(
  flowVersionId: string,
  values: Array<{ label: string; value: string | null | undefined }>,
) {
  for (const entry of values) {
    assert.equal(entry.value, flowVersionId, `${entry.label} must preserve flow_version_id`);
  }
}

describe("WhatsApp multi-step version graph E2E regression", () => {
  it("runs inbound → buttons → resume → condition → reply → completion on pinned version after draft edit", async () => {
    const ctx = createVersionGraphTestContext();
    const env = createExecutionEnvironment();
    env.flow.status = "draft";

    const published = await env.publish.publish(ctx, {
      flowId: env.flow.id,
      snapshot: whatsAppButtonFlowSnapshot,
      releaseNotes: "WhatsApp button journey v1",
    });
    const pinnedVersionId = published.version.id;

    // Inbound message → workflow start
    const started = await env.engine.start(ctx, {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404200",
      initialVariables: { lastMessage: "Hello" },
    });

    assert.equal(started.lifecycle, "waiting_input");
    assertSameFlowVersion(pinnedVersionId, [
      { label: "run after start", value: started.run.flow_version_id },
      { label: "session after start", value: started.session.flow_version_id },
    ]);
    assert.equal(started.run.current_node_id, BUTTONS_ID);
    assert.equal(started.session.current_node_id, BUTTONS_ID);
    assert.equal(started.run.status, "waiting_input");
    assert.equal(started.session.status, "waiting_input");

    // Buttons sent
    const outbound = started.variables.__outbound as { kind?: string; text?: string; buttons?: unknown[] };
    assert.equal(outbound.kind, "buttons");
    assert.equal(outbound.text, "Choose an option");
    assert.ok(Array.isArray(outbound.buttons) && outbound.buttons.length === 2);

    // Simulate draft edit while conversation waits for input
    await env.nodeRepository.deleteByFlowId(env.flow.id);
    await env.edgeRepository.deleteByFlowId(env.flow.id);
    const regeneratedTrigger = await env.nodeRepository.create({
      flowId: env.flow.id,
      type: "trigger",
      config: { builderType: "start", label: "Regenerated draft trigger" },
    });
    env.flow.has_unpublished_draft = true;
    assert.notEqual(regeneratedTrigger.id, TRIGGER_ID);
    assert.equal(await env.versionGraph.hasNode(pinnedVersionId, BUTTONS_ID), true);
    assert.equal(await env.versionGraph.hasNode(pinnedVersionId, regeneratedTrigger.id), false);

    // User presses button → workflow resume → condition → next node
    const resumed = await env.engine.resume(ctx, {
      runId: started.run.id,
      input: {
        replyId: "booking",
        title: "Book now",
        kind: "interactive_reply",
        interactive_selection: "Book now",
      },
    });

    assert.equal(resumed.lifecycle, "completed");
    assertSameFlowVersion(pinnedVersionId, [
      { label: "run after resume", value: resumed.run.flow_version_id },
      { label: "session after resume", value: resumed.session.flow_version_id },
    ]);

    // Condition evaluation
    assert.equal(resumed.variables.__branch, "yes");
    const conversation = resumed.variables.conversation as Record<string, unknown>;
    assert.equal(conversation.last_button_id, "booking");
    assert.equal(conversation.last_button_title, "Book now");

    // Database state
    const persistedRun = await env.runRepository.findById(started.run.id);
    const persistedSession = await env.sessionRepository.findById(started.session.id);
    assert.ok(persistedRun);
    assert.ok(persistedSession);
    assert.equal(persistedRun.status, "completed");
    assert.equal(persistedSession.status, "completed");
    assertSameFlowVersion(pinnedVersionId, [
      { label: "persisted run", value: persistedRun.flow_version_id },
      { label: "persisted session", value: persistedSession.flow_version_id },
    ]);
    assert.equal(persistedRun.current_node_id, END_YES_ID);
    assert.equal(persistedSession.current_node_id, END_YES_ID);
    assert.equal(await env.versionGraph.hasNode(pinnedVersionId, END_YES_ID), true);
    assert.equal(await env.versionGraph.hasNode(pinnedVersionId, regeneratedTrigger.id), false);

    // Outbound reply from send_message node
    const completionOutbound = resumed.variables.__outbound as { kind?: string; text?: string };
    assert.equal(completionOutbound.kind, "text");
    assert.equal(completionOutbound.text, "Thanks for booking! We will confirm shortly.");

    // Workflow completion
    assert.equal(resumed.run.status, "completed");
    assert.equal(resumed.session.status, "completed");
    assert.equal(resumed.run.finished_at !== null, true);
  });
});
