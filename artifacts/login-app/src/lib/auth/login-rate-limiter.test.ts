import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearLoginFailures,
  getLoginRateLimitStatus,
  recordLoginFailure,
} from "./login-rate-limiter.js";

describe("login-rate-limiter (browser session throttle)", () => {
  beforeEach(() => {
    // jsdom/node: emulate sessionStorage for unit tests
    const store = new Map<string, string>();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    } as Storage;
    clearLoginFailures("user@example.com");
  });

  it("allows first attempts", () => {
    const status = getLoginRateLimitStatus("user@example.com");
    assert.equal(status.allowed, true);
    assert.equal(status.failureCount, 0);
  });

  it("locks after 5 failures within the window", () => {
    const email = "User@Example.com";
    for (let i = 0; i < 5; i++) recordLoginFailure(email);
    const status = getLoginRateLimitStatus(email);
    assert.equal(status.allowed, false);
    assert.ok(status.retryAfterSeconds >= 1);
  });

  it("clears on successful sign-in path", () => {
    for (let i = 0; i < 3; i++) recordLoginFailure("a@b.com");
    clearLoginFailures("a@b.com");
    assert.equal(getLoginRateLimitStatus("a@b.com").allowed, true);
    assert.equal(getLoginRateLimitStatus("a@b.com").failureCount, 0);
  });
});
