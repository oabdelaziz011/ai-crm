import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEngagementMetadataPatch,
  mergeChannelSessionMetadata,
  readAiEmployeeEngagement,
  resolveAiEmployeeEngagement,
  markEngagementWelcomeDelivered,
} from "./ai-employee-engagement-session.js";

describe("ai employee engagement session", () => {
  const employeeId = "emp-1";
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("starts a new engagement on first inbound", () => {
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: null,
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: employeeId,
      previousEngagement: null,
    });
    assert.equal(result.isNewEngagement, true);
    assert.equal(result.engagement.startedAt, now.toISOString());
    assert.equal(result.engagement.welcomeDeliveredAt, null);
  });

  it("keeps the same engagement inside the timeout window", () => {
    const previousEngagement = {
      startedAt: "2026-08-24T10:00:00.000Z",
      aiEmployeeId: employeeId,
      welcomeDeliveredAt: "2026-08-24T10:00:00.000Z",
    };
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: "2026-08-24T11:30:00.000Z",
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: employeeId,
      previousEngagement,
    });
    assert.equal(result.isNewEngagement, false);
    assert.deepEqual(result.engagement, previousEngagement);
  });

  it("starts a new engagement when inactivity exceeds timeout", () => {
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: "2026-08-21T12:00:00.000Z",
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: employeeId,
      previousEngagement: {
        startedAt: "2026-08-21T12:00:00.000Z",
        aiEmployeeId: employeeId,
        welcomeDeliveredAt: "2026-08-21T12:00:00.000Z",
      },
    });
    assert.equal(result.isNewEngagement, true);
    assert.equal(result.engagement.welcomeDeliveredAt, null);
  });

  it("does not rotate at the exact timeout boundary", () => {
    const previousEngagement = {
      startedAt: "2026-08-23T12:00:00.000Z",
      aiEmployeeId: employeeId,
      welcomeDeliveredAt: "2026-08-23T12:00:00.000Z",
    };
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: "2026-08-23T12:00:00.000Z",
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: employeeId,
      previousEngagement,
    });
    assert.equal(result.isNewEngagement, false);
    assert.deepEqual(result.engagement, previousEngagement);
  });

  it("rotates one millisecond after the timeout boundary", () => {
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: "2026-08-23T11:59:59.999Z",
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: employeeId,
      previousEngagement: {
        startedAt: "2026-08-23T11:59:59.999Z",
        aiEmployeeId: employeeId,
        welcomeDeliveredAt: "2026-08-23T11:59:59.999Z",
      },
    });
    assert.equal(result.isNewEngagement, true);
  });

  it("starts a new engagement when the AI employee changes", () => {
    const result = resolveAiEmployeeEngagement({
      previousLastInboundAt: "2026-08-24T11:59:00.000Z",
      now,
      sessionTimeoutMinutes: 1440,
      aiEmployeeId: "emp-2",
      previousEngagement: {
        startedAt: "2026-08-24T11:00:00.000Z",
        aiEmployeeId: employeeId,
        welcomeDeliveredAt: "2026-08-24T11:00:00.000Z",
      },
    });
    assert.equal(result.isNewEngagement, true);
    assert.equal(result.engagement.aiEmployeeId, "emp-2");
  });

  it("merges channel session metadata without dropping existing keys", () => {
    const merged = mergeChannelSessionMetadata(
      { existingKey: "keep", aiEmployeeEngagement: { startedAt: "old" } },
      buildEngagementMetadataPatch({
        startedAt: "2026-08-24T12:00:00.000Z",
        aiEmployeeId: employeeId,
        welcomeDeliveredAt: null,
      }),
    );
    assert.equal(merged.existingKey, "keep");
    assert.equal(readAiEmployeeEngagement(merged)?.startedAt, "2026-08-24T12:00:00.000Z");
  });

  it("marks welcome delivered against the engagement anchor", () => {
    const engagement = {
      startedAt: "2026-08-24T12:00:00.000Z",
      aiEmployeeId: employeeId,
      welcomeDeliveredAt: null,
    };
    const delivered = markEngagementWelcomeDelivered(engagement);
    assert.equal(delivered.welcomeDeliveredAt, engagement.startedAt);
  });
});
