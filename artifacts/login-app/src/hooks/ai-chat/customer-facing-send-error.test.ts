import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSafeCustomerDetail,
  resolveFloatingSendErrorMessage,
  toCustomerFacingSendError,
} from "./customer-facing-send-error.ts";

describe("customer facing send error", () => {
  it("hides a provider quota sentence that has no underscore", () => {
    const shown = toCustomerFacingSendError(new Error("You exceeded your current quota. Please retry."));
    assert.equal(shown, "channel_route_failed");
    assert.equal(isSafeCustomerDetail("You exceeded your current quota. Please retry."), false);
  });

  it("hides provider_rate_limit_exceeded and stack traces", () => {
    assert.equal(toCustomerFacingSendError(new Error("provider_rate_limit_exceeded")), "channel_route_failed");
    assert.equal(isSafeCustomerDetail("Error: failed\n    at ToolCallLoopService.run (src/runtime/tool-call-loop-service.ts:10)"), false);
  });

  it("shows the persistence human message and not the developer insert error", () => {
    const error = Object.assign(new Error("insert failed: provider_rate_limit_exceeded"), {
      humanMessage: "The assistant reply could not be saved.",
    });
    assert.equal(toCustomerFacingSendError(error), "The assistant reply could not be saved.");
  });

  it("does not show a human message that still contains a provider code", () => {
    const error = { humanMessage: "Saved, but provider_rate_limit_exceeded" };
    assert.equal(toCustomerFacingSendError(error), "channel_route_failed");
  });

  it("renders the persistence message and replaces provider text with the generic failure", () => {
    const copy = {
      channelRouteFailed: "The message could not be delivered to the AI runtime.",
      runtimeFailed: (detail: string) => `The assistant could not complete your request. ${detail}`,
    };
    assert.equal(
      resolveFloatingSendErrorMessage("The assistant reply could not be saved.", copy),
      "The assistant could not complete your request. The assistant reply could not be saved.",
    );
    assert.equal(resolveFloatingSendErrorMessage("provider_rate_limit_exceeded", copy), copy.channelRouteFailed);
    assert.equal(resolveFloatingSendErrorMessage(null, copy), null);
  });
});
