import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asHandoffQueueId } from "./handoff-lifecycle-bridge.js";
import { deriveHandoffOwnershipView } from "./handoff-ownership-view.js";
import { isToolbarActionVisible } from "../omnichannel/presentation/lifecycle-action-groups.js";

describe("asHandoffQueueId", () => {
  it("accepts canonical UUIDs only", () => {
    assert.equal(
      asHandoffQueueId("09371d1f-83e5-4bb5-af98-d4974608cc73"),
      "09371d1f-83e5-4bb5-af98-d4974608cc73",
    );
    assert.equal(asHandoffQueueId("escalated"), null);
    assert.equal(asHandoffQueueId("unassigned"), null);
    assert.equal(asHandoffQueueId(null), null);
  });
});

describe("deriveHandoffOwnershipView", () => {
  it("allows AI when ownership is ai_employee and not paused", () => {
    const view = deriveHandoffOwnershipView({
      ownerType: "ai_employee",
      ownerId: "ai-1",
      ownerLabel: "AI",
      queueId: null,
      assignedUserId: null,
      aiAssistantId: "ai-1",
      lifecycleState: "AI_HANDLING",
      isPaused: false,
    });
    assert.equal(view.aiAutomatedRepliesAllowed, true);
    assert.equal(view.ownerKind, "ai");
  });

  it("blocks AI when human owns", () => {
    const view = deriveHandoffOwnershipView({
      ownerType: "human_agent",
      ownerId: "u-1",
      ownerLabel: "Agent",
      queueId: null,
      assignedUserId: "u-1",
      aiAssistantId: "ai-1",
      lifecycleState: "ASSIGNED",
      isPaused: false,
    });
    assert.equal(view.aiAutomatedRepliesAllowed, false);
    assert.equal(view.ownerKind, "human");
  });

  it("blocks AI when paused", () => {
    const view = deriveHandoffOwnershipView({
      ownerType: "ai_employee",
      ownerId: "ai-1",
      ownerLabel: "AI",
      queueId: null,
      assignedUserId: null,
      aiAssistantId: "ai-1",
      lifecycleState: "PAUSED",
      isPaused: true,
    });
    assert.equal(view.aiAutomatedRepliesAllowed, false);
  });
});

describe("toolbar pause/resume visibility", () => {
  const allowAll = () => true;

  it("shows pause when human-owned and not paused", () => {
    assert.equal(
      isToolbarActionVisible({
        actionId: "pause_ai",
        lifecycleState: "ASSIGNED",
        escalated: false,
        isClosed: false,
        canPerform: allowAll,
        aiPaused: false,
      }),
      true,
    );
  });

  it("shows resume when paused", () => {
    assert.equal(
      isToolbarActionVisible({
        actionId: "resume_ai",
        lifecycleState: "ASSIGNED",
        escalated: false,
        isClosed: false,
        canPerform: allowAll,
        aiPaused: true,
      }),
      true,
    );
    assert.equal(
      isToolbarActionVisible({
        actionId: "pause_ai",
        lifecycleState: "ASSIGNED",
        escalated: false,
        isClosed: false,
        canPerform: allowAll,
        aiPaused: true,
      }),
      false,
    );
  });
});
