import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInstagramHealthRequestHeaders,
  isInstagramHealthNonJson5xx,
  requestInstagramOutboundHealth,
  type InstagramOutboundHealthResponse,
} from "./instagram-outbound-health-client.js";

const apiBase = "https://api.valueor.org/api";
const healthUrl = `${apiBase}/instagram/channel-outbound-health`;

function okPayload(): InstagramOutboundHealthResponse {
  return {
    ok: true,
    latencyMs: 42,
    instagramBusinessAccountId: "17841400000000000",
    pageId: null,
    accessToken: { valid: true, ownerId: "1", ownerName: "valueor2026" },
    instagramAccount: { ok: true, username: "valueor2026", name: "ValueOR" },
    sendProbe: { ok: true },
  };
}

function jsonResponse(status: number, body: unknown, contentType = "application/json; charset=utf-8"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

function html502Response(): Response {
  return new Response("<!DOCTYPE html><html><title>502: Bad gateway</title></html>", {
    status: 502,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}

describe("buildInstagramHealthRequestHeaders", () => {
  it("adds Accept application/json without dropping auth headers", () => {
    const headers = buildInstagramHealthRequestHeaders({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    });
    assert.equal(headers.Accept, "application/json");
    assert.equal(headers.Authorization, "Bearer test-token");
    assert.equal(headers["Content-Type"], "application/json");
  });
});

describe("isInstagramHealthNonJson5xx", () => {
  it("is true only for non-JSON 5xx", () => {
    assert.equal(isInstagramHealthNonJson5xx(502, true), true);
    assert.equal(isInstagramHealthNonJson5xx(504, true), true);
    assert.equal(isInstagramHealthNonJson5xx(502, false), false);
    assert.equal(isInstagramHealthNonJson5xx(401, true), false);
  });
});

describe("requestInstagramOutboundHealth", () => {
  it("sends Accept application/json on the health POST", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, okPayload());
    };

    const result = await requestInstagramOutboundHealth({
      apiBase,
      companyId: "company-1",
      companyChannelId: "channel-1",
      authHeaders: { "Content-Type": "application/json", Authorization: "Bearer abc" },
      fetchFn,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, healthUrl);
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("Accept"), "application/json");
    assert.equal(headers.get("Authorization"), "Bearer abc");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.credentials, "include");
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({ companyId: "company-1", companyChannelId: "channel-1" }),
    );
  });

  it("retries exactly once after Cloudflare HTML 502 then succeeds", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) return html502Response();
      return jsonResponse(200, okPayload());
    };

    const result = await requestInstagramOutboundHealth({
      apiBase,
      companyId: "company-1",
      companyChannelId: "channel-1",
      authHeaders: { "Content-Type": "application/json" },
      fetchFn,
    });

    assert.equal(attempts, 2);
    assert.equal(result.ok, true);
    assert.equal(result.instagramAccount.username, "valueor2026");
  });

  it("retries exactly once after a browser network error then succeeds", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return jsonResponse(200, okPayload());
    };

    const result = await requestInstagramOutboundHealth({
      apiBase,
      companyId: "company-1",
      companyChannelId: "channel-1",
      authHeaders: { "Content-Type": "application/json" },
      fetchFn,
    });

    assert.equal(attempts, 2);
    assert.equal(result.ok, true);
  });

  it("does not retry application JSON 502 health reports", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      return jsonResponse(502, {
        ok: false,
        latencyMs: 10,
        error: "Instagram Business Account ID mismatch",
        instagramBusinessAccountId: "1",
        pageId: null,
        accessToken: { valid: false },
        instagramAccount: { ok: false, error: "Instagram Business Account ID mismatch" },
        sendProbe: { ok: false },
      });
    };

    await assert.rejects(
      () =>
        requestInstagramOutboundHealth({
          apiBase,
          companyId: "company-1",
          companyChannelId: "channel-1",
          authHeaders: { "Content-Type": "application/json" },
          fetchFn,
        }),
      /Instagram Business Account ID mismatch/,
    );
    assert.equal(attempts, 1);
  });

  it("does not retry a third time when HTML 502 repeats", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      return html502Response();
    };

    await assert.rejects(
      () =>
        requestInstagramOutboundHealth({
          apiBase,
          companyId: "company-1",
          companyChannelId: "channel-1",
          authHeaders: { "Content-Type": "application/json" },
          fetchFn,
        }),
      /non-JSON \(502\)/,
    );
    assert.equal(attempts, 2);
  });

  it("maps persistent network failure after one retry", async () => {
    let attempts = 0;
    const fetchFn: typeof fetch = async () => {
      attempts += 1;
      throw new TypeError("Failed to fetch");
    };

    await assert.rejects(
      () =>
        requestInstagramOutboundHealth({
          apiBase,
          companyId: "company-1",
          companyChannelId: "channel-1",
          authHeaders: { "Content-Type": "application/json" },
          fetchFn,
        }),
      /Cannot reach Instagram API/,
    );
    assert.equal(attempts, 2);
  });
});
