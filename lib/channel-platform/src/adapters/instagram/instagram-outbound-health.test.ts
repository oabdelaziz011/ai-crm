import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesConfiguredInstagramAccountId,
  performInstagramOutboundHealthCheck,
} from "./instagram-outbound-health.js";

describe("matchesConfiguredInstagramAccountId", () => {
  it("matches against either Graph id or user_id", () => {
    assert.equal(matchesConfiguredInstagramAccountId("17841400000000001", "app-scoped", "17841400000000001"), true);
    assert.equal(matchesConfiguredInstagramAccountId("17841400000000001", "17841400000000001", undefined), true);
    assert.equal(matchesConfiguredInstagramAccountId("17841400000000001", "other", "other2"), false);
  });
});

describe("performInstagramOutboundHealthCheck", () => {
  const runtimeConfig = {
    instagramBusinessAccountId: "17841400000000001",
    accessToken: "IGQWtoken123456",
    verifyToken: "verify",
    apiVersion: "v21.0",
  };

  it("accepts Instagram Login user_id when node id differs (OAuth storage shape)", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({
            user_id: "17841400000000001",
            id: "app-scoped-me",
            username: "valueor2026",
            name: "ValueOR",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/17841400000000001?") && !url.includes("/messages")) {
        return new Response(
          JSON.stringify({
            id: "app-scoped-node",
            user_id: "17841400000000001",
            username: "valueor2026",
            name: "ValueOR",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/messages") && init?.method === "POST") {
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
    assert.equal(report.accessToken.ownerId, "17841400000000001");
    assert.equal(report.instagramAccount.ok, true);
    assert.equal(report.instagramAccount.error, undefined);
    assert.equal(report.ok, true);
  });

  it("accepts alias when Graph returns only a different id but resolves username for configured path", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/me?")) {
        // /me may only expose app-scoped id; configured messaging id is still valid if node resolves.
        return new Response(
          JSON.stringify({ user_id: "app-scoped-me", id: "app-scoped-me", username: "valueor2026" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/17841400000000001?") && !url.includes("/messages")) {
        return new Response(
          JSON.stringify({ id: "app-scoped-only", username: "valueor2026", name: "ValueOR" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/messages") && init?.method === "POST") {
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

    assert.equal(report.instagramAccount.ok, true);
    assert.equal(report.ok, true);
  });

  it("still fails when configured id does not resolve to this account", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({ user_id: "999", id: "999", username: "other" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/17841400000000001?")) {
        return new Response(
          JSON.stringify({ error: { message: "Unsupported get request", code: 100 } }),
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

    assert.equal(report.instagramAccount.ok, false);
    assert.match(String(report.instagramAccount.error), /Unsupported get request/);
    assert.equal(report.ok, false);
  });
});
