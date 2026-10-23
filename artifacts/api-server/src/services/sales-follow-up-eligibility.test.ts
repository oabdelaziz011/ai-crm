import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSalesFollowUpOptedOut } from "./sales-follow-up-eligibility.js";

describe("resolveSalesFollowUpOptedOut", () => {
  it("opts out when customer receive_marketing is false", () => {
    assert.equal(
      resolveSalesFollowUpOptedOut({
        leadMetadata: {},
        receiveMarketing: false,
        stopOnOptOut: true,
      }),
      true,
    );
  });

  it("opts out from lead metadata even when marketing pref is true", () => {
    assert.equal(
      resolveSalesFollowUpOptedOut({
        leadMetadata: { optedOut: true },
        receiveMarketing: true,
        stopOnOptOut: true,
      }),
      true,
    );
  });

  it("allows follow-up when no opt-out signals and stopOnOptOut is on", () => {
    assert.equal(
      resolveSalesFollowUpOptedOut({
        leadMetadata: {},
        receiveMarketing: true,
        stopOnOptOut: true,
      }),
      false,
    );
    assert.equal(
      resolveSalesFollowUpOptedOut({
        leadMetadata: {},
        receiveMarketing: undefined,
        stopOnOptOut: true,
      }),
      false,
    );
  });

  it("ignores opt-out signals when stopOnOptOut is disabled", () => {
    assert.equal(
      resolveSalesFollowUpOptedOut({
        leadMetadata: { doNotContact: true },
        receiveMarketing: false,
        stopOnOptOut: false,
      }),
      false,
    );
  });
});
