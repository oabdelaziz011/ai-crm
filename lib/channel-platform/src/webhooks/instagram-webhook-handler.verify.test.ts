import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstagramWebhookHandler } from "./instagram-webhook-handler.js";

type Match = { id: string; companyId: string };

function handlerWithMatches(matches: Match[]) {
  return createInstagramWebhookHandler({
    services: {} as never,
    ports: {
      registry: {
        findCompanyChannelsByInstagramVerifyToken: async () => matches,
      },
    } as never,
    resolveSystemContext: () => ({}) as never,
    resolveCompanyChannel: async () => ({ companyId: "co-1", verifyToken: "tok" }),
  });
}

describe("InstagramWebhookHandler verifyGetByVerifyToken", () => {
  it("returns 200 with the exact challenge when exactly one channel matches", async () => {
    const result = await handlerWithMatches([{ id: "cc-1", companyId: "co-1" }]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "challenge-ig-1",
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, "challenge-ig-1");
  });

  it("returns 403 for invalid/missing tokens", async () => {
    const missing = await handlerWithMatches([{ id: "cc-1", companyId: "co-1" }]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.challenge": "x",
    });
    assert.equal(missing.status, 403);

    const zero = await handlerWithMatches([]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "x",
    });
    assert.equal(zero.status, 403);
  });

  it("returns 403 when multiple matching records exist (including cross-company)", async () => {
    const sameCompany = await handlerWithMatches([
      { id: "cc-1", companyId: "co-1" },
      { id: "cc-2", companyId: "co-1" },
    ]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "x",
    });
    assert.equal(sameCompany.status, 403);

    const crossCompany = await handlerWithMatches([
      { id: "cc-a", companyId: "co-a" },
      { id: "cc-b", companyId: "co-b" },
    ]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "x",
    });
    assert.equal(crossCompany.status, 403);
  });
});
