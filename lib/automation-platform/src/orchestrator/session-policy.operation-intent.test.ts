import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";
import {
  shouldReenterOperationIntent,
  shouldRestartGreetingSession,
  shouldRestartStalePublishedVersion,
} from "./session-policy.js";
import type { AutomationRunRecord } from "../types.js";

function runWithButtons(buttonIds: string[]): AutomationRunRecord {
  return {
    id: "run-1",
    variables: {
      __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
      __outbound: {
        kind: "buttons",
        text: "تحب تسألي عن حاجة تانية؟",
        buttons: buttonIds.map((id) => ({ id, label: id })),
      },
    },
  } as AutomationRunRecord;
}

describe("shouldReenterOperationIntent", () => {
  it("restarts cancel when the current menu has no cancel button", () => {
    assert.equal(shouldReenterOperationIntent(runWithButtons(["yes", "no"]), "عايزه الغي ميعاد كشف"), true);
  });

  it("does not restart when cancel is already on the menu", () => {
    assert.equal(shouldReenterOperationIntent(runWithButtons(["cancel", "book"]), "الغي الحجز"), false);
  });

  it("does not restart when the customer confirms the selected cancellation", () => {
    assert.equal(
      shouldReenterOperationIntent(
        runWithButtons(["confirm_cancel", "keep_booking"]),
        "تأكيد الإلغاء",
      ),
      false,
    );
  });

  it("restarts cancel from the intent question onto a fresh published graph", () => {
    const run = {
      id: "run-1",
      variables: { __waitingFor: "customer_intent" },
    } as AutomationRunRecord;
    assert.equal(shouldReenterOperationIntent(run, "عايزه الغي ميعاد حجز"), true);
  });
});

describe("shouldRestartStalePublishedVersion", () => {
  it("restarts the intent question onto the newly published graph", () => {
    const run = {
      id: "run-1",
      flow_version_id: "v13",
      variables: { __waitingFor: "customer_intent" },
    } as AutomationRunRecord;
    assert.equal(shouldRestartStalePublishedVersion({ run, publishedVersionId: "v14" }), true);
  });

  it("does not abandon a mid-booking wait after publish", () => {
    const run = {
      id: "run-1",
      flow_version_id: "v13",
      variables: { __waitingFor: "customer_phone" },
    } as AutomationRunRecord;
    assert.equal(shouldRestartStalePublishedVersion({ run, publishedVersionId: "v14" }), false);
  });
});

describe("shouldRestartGreetingSession", () => {
  it("restarts a held running session on مرحبا so welcome is sent", () => {
    assert.equal(
      shouldRestartGreetingSession({
        inboundText: "مرحبا",
        waitingFor: null,
        routeMode: "hold_active_session",
      }),
      true,
    );
  });

  it("restarts an interactive wait on مرحبا instead of re-sending the same buttons", () => {
    assert.equal(
      shouldRestartGreetingSession({
        inboundText: "مرحبا",
        waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
        routeMode: "resume",
      }),
      true,
    );
  });

  it("does not restart a wait_for_input greeting that already replies in-place", () => {
    assert.equal(
      shouldRestartGreetingSession({
        inboundText: "مرحبا",
        waitingFor: "customer_intent",
        routeMode: "resume",
      }),
      false,
    );
  });

  it("does not restart a real booking intent", () => {
    assert.equal(
      shouldRestartGreetingSession({
        inboundText: "عايز أحجز",
        waitingFor: INTERACTIVE_SELECTION_INPUT_KEY,
        routeMode: "hold_active_session",
      }),
      false,
    );
  });
});
