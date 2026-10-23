import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  evaluateSalesFollowUp,
  normalizeSalesFollowUpSettings,
  salesFollowUpIdempotencyKey,
  type SalesFollowUpSnapshot,
} from "./sales-follow-up.js";

function snapshot(overrides: Partial<SalesFollowUpSnapshot> = {}): SalesFollowUpSnapshot {
  const dueAt = new Date("2026-10-17T10:00:00.000Z");
  return {
    companyId: "company-a",
    leadId: "lead-1",
    attemptNumber: 1,
    dueAt,
    now: new Date("2026-10-17T10:05:00.000Z"),
    settings: {
      ...DEFAULT_SALES_FOLLOW_UP_SETTINGS,
      enabled: true,
      channels: ["whatsapp"],
      approvalMode: "automatic",
      maxAttempts: 2,
    },
    channel: "whatsapp",
    channelConnected: true,
    channelCanSend: true,
    optedOut: false,
    customerRepliedAfterSchedule: false,
    converted: false,
    purchased: false,
    requestClosed: false,
    assigneeChanged: false,
    attemptsAlreadySent: 0,
    companySentToday: 0,
    idempotencyKeySeen: false,
    transientFailure: false,
    withinBusinessHours: true,
    ...overrides,
  };
}

describe("sales follow-up policy", () => {
  it("stays disabled until a company explicitly enables it", () => {
    const settings = normalizeSalesFollowUpSettings({});
    assert.equal(settings.enabled, false);
    assert.equal(settings.approvalMode, "draft");
    const decision = evaluateSalesFollowUp(snapshot({ settings }));
    assert.equal(decision.outcome, "skipped");
    assert.equal(decision.reason, "automation_disabled");
    assert.equal(decision.send, false);
  });

  it("authorizes one due attempt and blocks a duplicate idempotency key", () => {
    const due = evaluateSalesFollowUp(snapshot());
    assert.equal(due.outcome, "sent");
    assert.equal(due.send, true);
    const again = evaluateSalesFollowUp(snapshot({ idempotencyKeySeen: true }));
    assert.equal(again.outcome, "skipped");
    assert.equal(again.reason, "duplicate_attempt");
    assert.equal(again.send, false);
    assert.equal(due.idempotencyKey, salesFollowUpIdempotencyKey("company-a", "lead-1", 1, snapshot().dueAt));
  });

  it("cancels when the customer replies, converts, buys, closes, opts out, or is reassigned", () => {
    const cases = [
      ["customerRepliedAfterSchedule", "customer_replied"],
      ["converted", "converted"],
      ["purchased", "purchased"],
      ["requestClosed", "request_closed"],
      ["optedOut", "opt_out"],
      ["assigneeChanged", "reassigned"],
    ] as const;
    for (const [field, reason] of cases) {
      const decision = evaluateSalesFollowUp(snapshot({ [field]: true }));
      assert.equal(decision.outcome, "cancelled", field);
      assert.equal(decision.reason, reason);
      assert.equal(decision.send, false);
    }
  });

  it("does not send before the due time, outside hours, over the cap, or on a disconnected channel", () => {
    assert.equal(evaluateSalesFollowUp(snapshot({ now: new Date("2026-10-17T09:00:00.000Z") })).reason, "not_due");
    assert.equal(evaluateSalesFollowUp(snapshot({ withinBusinessHours: false })).reason, "outside_business_hours");
    assert.equal(evaluateSalesFollowUp(snapshot({ attemptsAlreadySent: 2 })).reason, "max_attempts");
    assert.equal(evaluateSalesFollowUp(snapshot({ companySentToday: 50 })).reason, "company_daily_limit");
    const disconnected = evaluateSalesFollowUp(snapshot({ channelConnected: false }));
    assert.equal(disconnected.outcome, "draft");
    assert.equal(disconnected.reason, "channel_unavailable");
    assert.equal(disconnected.send, false);
  });

  it("retries a transient failure without claiming the message was sent", () => {
    const decision = evaluateSalesFollowUp(snapshot({ transientFailure: true }));
    assert.equal(decision.outcome, "retried");
    assert.equal(decision.reason, "transient_failure");
    assert.equal(decision.send, false);
  });

  it("creates a draft when automatic sending is not approved", () => {
    const decision = evaluateSalesFollowUp(
      snapshot({ settings: { ...snapshot().settings, approvalMode: "draft" } }),
    );
    assert.equal(decision.outcome, "draft");
    assert.equal(decision.reason, "approval_required");
    assert.equal(decision.send, false);
  });
});
