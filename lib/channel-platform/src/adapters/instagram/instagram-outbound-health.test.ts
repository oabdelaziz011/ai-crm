import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesConfiguredInstagramAccountId,
  parseInstagramLoginMeProfile,
  performInstagramOutboundHealthCheck,
} from "./instagram-outbound-health.js";

describe("matchesConfiguredInstagramAccountId", () => {
  it("matches against either Graph id or user_id", () => {
    assert.equal(
      matchesConfiguredInstagramAccountId("17841400000000001", "app-scoped", "17841400000000001"),
      true,
    );
    assert.equal(
      matchesConfiguredInstagramAccountId("17841400000000001", "17841400000000001", undefined),
      true,
    );
    assert.equal(matchesConfiguredInstagramAccountId("17841400000000001", "other", "other2"), false);
  });
});

describe("parseInstagramLoginMeProfile", () => {
  it("prefers user_id over app-scoped id on flat /me", () => {
    const profile = parseInstagramLoginMeProfile({
      user_id: "17841400000000001",
      id: "app-scoped",
      username: "valueor2026",
    });
    assert.equal(profile.userId, "17841400000000001");
    assert.equal(profile.appScopedId, "app-scoped");
    assert.equal(profile.username, "valueor2026");
  });

  it("reads nested data[0] shape", () => {
    const profile = parseInstagramLoginMeProfile({
      data: [{ user_id: "17841400000000001", username: "valueor2026" }],
    });
    assert.equal(profile.userId, "17841400000000001");
    assert.equal(profile.username, "valueor2026");
  });
});

describe("performInstagramOutboundHealthCheck", () => {
  const runtimeConfig = {
    instagramBusinessAccountId: "stale-or-wrong-id",
    accessToken: "IGQWtoken123456",
    verifyToken: "verify",
    apiVersion: "v21.0",
  };

  it("marks account healthy from /me user_id even when configured id differs from app-scoped id", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            user_id: "17841400000000001",
            id: "app-scoped-me",
            username: "valueor2026",
            name: "ValueOR",
            account_type: "BUSINESS",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/messages") && init?.method === "POST") {
        assert.match(url, /17841400000000001\/messages/);
        return new Response(JSON.stringify({ error: { message: "Invalid recipient", code: 100 } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
    };

    const report = await performInstagramOutboundHealthCheck({
      companyId: "company-1",
      runtimeConfig,
      fetchFn,
    });

    assert.equal(report.accessToken.valid, true);
    assert.equal(report.instagramAccount.ok, true);
    assert.equal(report.instagramAccount.username, "valueor2026");
    assert.equal(report.resolvedInstagramBusinessAccountId, "17841400000000001");
    assert.equal(report.ok, true);
    assert.equal(report.error, undefined);
  });

  it("rejects personal accounts", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            user_id: "17841400000000001",
            username: "personal_user",
            account_type: "PERSONAL",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: { message: "skip" } }), { status: 400 });
    };

    const report = await performInstagramOutboundHealthCheck({
      companyId: "company-1",
      runtimeConfig,
      fetchFn,
    });

    assert.equal(report.instagramAccount.ok, false);
    assert.match(String(report.instagramAccount.error), /Personal/);
    assert.equal(report.ok, false);
  });

  it("fails when /me cannot load the professional profile", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: { message: "skip" } }), { status: 400 });
    };

    const report = await performInstagramOutboundHealthCheck({
      companyId: "company-1",
      runtimeConfig,
      fetchFn,
    });

    assert.equal(report.accessToken.valid, false);
    assert.equal(report.instagramAccount.ok, false);
    assert.match(String(report.error), /Invalid OAuth access token/);
    assert.equal(report.ok, false);
  });
});
