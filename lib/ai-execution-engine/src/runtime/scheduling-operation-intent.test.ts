import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerWantsBookingStatusFromText,
  isNonMutatingFollowUpMessage,
  resolveSchedulingOperationIntent,
  schedulingIntentAllowsTool,
  shouldInvalidatePriorSchedulingSeed,
} from "./scheduling-operation-intent.js";

describe("scheduling operation intent", () => {
  it("detects booking status by reference without cancel verbs", () => {
    assert.equal(
      customerWantsBookingStatusFromText("عايزة أعرف حالة الحجز BK-000088"),
      true,
    );
    assert.equal(customerWantsBookingStatusFromText("ألغي BK-000088"), false);
  });

  it("treats ليه as non-mutating follow-up", () => {
    assert.equal(isNonMutatingFollowUpMessage("ليه؟"), true);
    assert.equal(resolveSchedulingOperationIntent([{ role: "user", content: "ليه؟" }]), "none");
    assert.equal(
      resolveSchedulingOperationIntent([
        { role: "user", content: "e2e-ci-leh 123 ليه؟" },
      ]),
      "none",
    );
  });

  it("isolates ticket intent from booking tools", () => {
    assert.equal(
      resolveSchedulingOperationIntent([{ role: "user", content: "عايزة أرفع شكوى" }]),
      "ticket",
    );
    assert.equal(schedulingIntentAllowsTool("ticket", "create_booking"), false);
    assert.equal(schedulingIntentAllowsTool("ticket", "create_ticket"), true);
  });

  it("invalidates prior scheduling seed on topic switches but not phone intake", () => {
    assert.equal(
      shouldInvalidatePriorSchedulingSeed([{ role: "user", content: "ليه؟" }]),
      true,
    );
    assert.equal(
      shouldInvalidatePriorSchedulingSeed([
        { role: "user", content: "عايزة أعرف حالة الحجز BK-000088" },
      ]),
      true,
    );
    assert.equal(
      shouldInvalidatePriorSchedulingSeed([{ role: "user", content: "01039399960" }]),
      false,
    );
  });
});
