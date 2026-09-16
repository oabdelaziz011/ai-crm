import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessTokenNeedsRefresh } from "./access-token-expiry.ts";

describe("accessTokenNeedsRefresh", () => {
  const now = 1_700_000_000_000; // fixed ms

  it("refreshes when expiry is missing or invalid", () => {
    assert.equal(accessTokenNeedsRefresh(null, now), true);
    assert.equal(accessTokenNeedsRefresh(undefined, now), true);
    assert.equal(accessTokenNeedsRefresh(0, now), true);
    assert.equal(accessTokenNeedsRefresh(Number.NaN, now), true);
  });

  it("refreshes when already expired", () => {
    const expiredSec = Math.floor((now - 5_000) / 1000);
    assert.equal(accessTokenNeedsRefresh(expiredSec, now), true);
  });

  it("refreshes inside the skew window", () => {
    const soonSec = Math.floor((now + 30_000) / 1000);
    assert.equal(accessTokenNeedsRefresh(soonSec, now, 60_000), true);
  });

  it("keeps token when plenty of lifetime remains", () => {
    const laterSec = Math.floor((now + 10 * 60_000) / 1000);
    assert.equal(accessTokenNeedsRefresh(laterSec, now, 60_000), false);
  });
});
