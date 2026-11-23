import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMessengerWebhookHandler } from "./messenger-webhook-handler.js";

type Match = { id: string; companyId: string };

function handlerWithMatches(matches: Match[]) {
  return createMessengerWebhookHandler({
    services: {} as never,
    ports: {
      registry: {
        findCompanyChannelsByMessengerVerifyToken: async () => matches,
      },
    } as never,
    resolveSystemContext: () => ({}) as never,
    resolveCompanyChannel: async () => ({ companyId: "co-1", verifyToken: "tok" }),
  });
}

describe("MessengerWebhookHandler verifyGetByVerifyToken", () => {
  it("returns 200 with the exact challenge when exactly one channel matches", async () => {
    const result = await handlerWithMatches([{ id: "cc-1", companyId: "co-1" }]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "challenge-123",
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, "challenge-123");
  });

  it("returns 403 when the verify token is missing", async () => {
    const result = await handlerWithMatches([{ id: "cc-1", companyId: "co-1" }]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.challenge": "challenge-123",
    });
    assert.equal(result.status, 403);
    assert.equal(result.body, "Forbidden");
    assert.equal(result.failReason, "missing_verify_token");
  });

  it("returns 403 when settings exist but no messenger company_channels row matches (zero)", async () => {
    const result = await handlerWithMatches([]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "x",
    });
    assert.equal(result.status, 403);
    assert.equal(result.failReason, "match_count_zero");
    assert.equal(result.matchCount, 0);
  });

  it("returns 403 when multiple messenger channels match the same verify token", async () => {
    const result = await handlerWithMatches([
      { id: "cc-1", companyId: "co-1" },
      { id: "cc-2", companyId: "co-1" },
    ]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "x",
    });
    assert.equal(result.status, 403);
    assert.equal(result.failReason, "match_count_ambiguous");
    assert.equal(result.matchCount, 2);
  });

  it("returns 403 for cross-company ambiguous matches (two companies, same token)", async () => {
    const result = await handlerWithMatches([
      { id: "cc-a", companyId: "co-a" },
      { id: "cc-b", companyId: "co-b" },
    ]).verifyGetByVerifyToken({
      "hub.mode": "subscribe",
      "hub.verify_token": "shared-tok",
      "hub.challenge": "x",
    });
    assert.equal(result.status, 403);
  });

  it("returns 403 when hub.mode is not subscribe even with a unique match", async () => {
    const result = await handlerWithMatches([{ id: "cc-1", companyId: "co-1" }]).verifyGetByVerifyToken({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "challenge-123",
    });
    assert.equal(result.status, 403);
    assert.equal(result.failReason, "challenge_rejected");
  });

  it("scoped verify returns resolve_channel_failed when company channel credentials cannot resolve", async () => {
    const handler = createMessengerWebhookHandler({
      services: {} as never,
      ports: { registry: {} } as never,
      resolveSystemContext: () => ({}) as never,
      resolveCompanyChannel: async () => {
        throw new Error("Messenger webhook verify token is not configured.");
      },
    });
    const result = await handler.verifyGet({
      companyChannelId: "cc-pending",
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "challenge-123",
    });
    assert.equal(result.status, 403);
    assert.equal(result.failReason, "resolve_channel_failed");
  });
});
