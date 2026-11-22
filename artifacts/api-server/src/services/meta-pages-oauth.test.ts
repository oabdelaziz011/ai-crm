import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetaPagesOauthReadiness,
  createMetaPagesOauthSession,
  MetaPagesOauthError,
  __metaPagesOauthTest,
} from "./meta-pages-oauth.js";

describe("meta-pages-oauth", () => {
  it("denies session when master flag is off", () => {
    const prev = process.env.META_PAGES_OAUTH_ENABLED;
    process.env.META_PAGES_OAUTH_ENABLED = "false";
    try {
      assert.throws(
        () =>
          createMetaPagesOauthSession({
            companyId: "d0000010-0001-4001-8001-000000000002",
            userId: null,
            channel: "messenger",
          }),
        (error: unknown) => error instanceof MetaPagesOauthError && error.code === "MPO_DISABLED",
      );
    } finally {
      process.env.META_PAGES_OAUTH_ENABLED = prev;
    }
  });

  it("signs and verifies company-bound state", () => {
    const secret = "unit-test-state-secret";
    const now = Date.now();
    const state = __metaPagesOauthTest.signState(
      {
        companyId: "d0000010-0001-4001-8001-000000000002",
        userId: "user-1",
        channel: "instagram",
        nonce: "abc",
        exp: now + 60_000,
      },
      secret,
    );
    const parsed = __metaPagesOauthTest.verifyAndParseState(
      state,
      secret,
      "d0000010-0001-4001-8001-000000000002",
      "instagram",
      now,
    );
    assert.equal(parsed.channel, "instagram");
    assert.throws(
      () =>
        __metaPagesOauthTest.verifyAndParseState(
          state,
          secret,
          "d0000010-0001-4001-8001-000000000099",
          "instagram",
          now,
        ),
      (error: unknown) =>
        error instanceof MetaPagesOauthError && error.code === "MPO_STATE_COMPANY_MISMATCH",
    );
  });

  it("reports readiness reasons without secrets", () => {
    const prevEnabled = process.env.META_PAGES_OAUTH_ENABLED;
    const prevAllow = process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS;
    process.env.META_PAGES_OAUTH_ENABLED = "true";
    process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS = "";
    try {
      const readiness = buildMetaPagesOauthReadiness("d0000010-0001-4001-8001-000000000002");
      assert.equal(readiness.ready, false);
      assert.equal(readiness.reason, "MPO_COMPANY_NOT_ALLOWED");
      assert.ok(!JSON.stringify(readiness).toLowerCase().includes("secret"));
    } finally {
      process.env.META_PAGES_OAUTH_ENABLED = prevEnabled;
      process.env.META_PAGES_OAUTH_ALLOWED_COMPANY_IDS = prevAllow;
    }
  });
});
