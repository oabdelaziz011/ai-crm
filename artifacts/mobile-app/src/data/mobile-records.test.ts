import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliverConfirmedMessage, postMobileRecord } from "./mobile-records";

const base = {
  apiUrl: "http://127.0.0.1:3001",
  token: "token",
  instanceHostname: "demo-alpha-trial-company.localhost",
  sessionCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("mobile record client", () => {
  it("does not call the server for a mismatched company", async () => {
    let called = false;
    const result = await postMobileRecord({
      ...base,
      action: { type: "customer.create", name: "Ada", companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      fetchImpl: async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "cross_tenant");
  });

  it("reports a network failure without treating it as an expired session", async () => {
    const result = await postMobileRecord({
      ...base,
      action: { type: "customer.create", name: "Ada" },
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "network_error");
  });

  it("reports an expired session", async () => {
    const result = await postMobileRecord({
      ...base,
      action: { type: "customer.create", name: "Ada" },
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ code: "unauthorized" }) }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "session_expired");
  });

  it("sends a confirmed message only through the prepared dispatch payload", async () => {
    const calls: string[] = [];
    const prepared = await postMobileRecord({
      ...base,
      action: { type: "conversation.send", text: "Hello", confirmSend: true },
      fetchImpl: async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sent: false,
            delivery: {
              path: "/api/omnichannel/outbound/dispatch",
              body: { companyId: base.sessionCompanyId, text: "Hello" },
            },
          }),
        };
      },
    });
    assert.equal(prepared.ok, true);
    const sent = await deliverConfirmedMessage({
      ...base,
      prepared: prepared.ok ? prepared.body : null,
      fetchImpl: async (url, init) => {
        calls.push(url);
        assert.equal(JSON.parse(init.body).companyId, base.sessionCompanyId);
        return { ok: true, status: 200, json: async () => ({ delivered: true }) };
      },
    });
    assert.equal(sent.ok, true);
    assert.deepEqual(calls, [
      "http://127.0.0.1:3001/api/mobile/records",
      "http://127.0.0.1:3001/api/omnichannel/outbound/dispatch",
    ]);
    const blocked = await deliverConfirmedMessage({ ...base, prepared: null, fetchImpl: async () => { throw new Error("should not send"); } });
    assert.equal(blocked.ok, false);
  });
});
