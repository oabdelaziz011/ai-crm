import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countEmailWorkspaceOutboundMetrics } from "./email-workspace-metrics.ts";

describe("countEmailWorkspaceOutboundMetrics", () => {
  it("counts confirmed Email outbound as sent — not Communication Center queue", () => {
    const counts = countEmailWorkspaceOutboundMetrics([
      {
        message_type: "outgoing",
        status: "sent",
        metadata: { dispatchConfirmed: true, outboundPhase: "sent" },
        external_message_id: "mid-1@valueor-test.local",
      },
      {
        message_type: "incoming",
        status: "sent",
        metadata: {},
      },
    ]);
    assert.deepEqual(counts, { sent: 1, pending: 0, failed: 0 });
  });

  it("counts preparing/dispatching as pending and failed as failed", () => {
    const counts = countEmailWorkspaceOutboundMetrics([
      {
        message_type: "outgoing",
        status: "pending",
        metadata: { outboundPhase: "preparing" },
      },
      {
        message_type: "outgoing",
        status: "failed",
        metadata: { outboundPhase: "failed", dispatchFailed: true },
      },
    ]);
    assert.deepEqual(counts, { sent: 0, pending: 1, failed: 1 });
  });

  it("does not treat unconfirmed sent status as delivered success", () => {
    const counts = countEmailWorkspaceOutboundMetrics([
      {
        message_type: "outgoing",
        status: "sent",
        metadata: { outboundPhase: "sent" },
      },
    ]);
    assert.equal(counts.sent, 0);
    assert.equal(counts.pending, 1);
    assert.equal(counts.failed, 0);
  });
});
