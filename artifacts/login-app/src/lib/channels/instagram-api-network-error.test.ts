import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBrowserNetworkFetchError,
  mapInstagramApiNetworkError,
} from "./instagram-api-network-error.js";

describe("mapInstagramApiNetworkError", () => {
  const url = "https://webhook.valueor.org/api/instagram/channel-outbound-health";

  it("rewrites Failed to fetch into a URL-specific network error", () => {
    const mapped = mapInstagramApiNetworkError(new TypeError("Failed to fetch"), url);
    assert.match(mapped.message, /Cannot reach Instagram API/);
    assert.match(mapped.message, /webhook\.valueor\.org\/api\/instagram\/channel-outbound-health/);
  });

  it("does not rewrite application errors", () => {
    const mapped = mapInstagramApiNetworkError(new Error("Authentication required."), url);
    assert.equal(mapped.message, "Authentication required.");
  });

  it("detects browser network TypeErrors", () => {
    assert.equal(isBrowserNetworkFetchError(new TypeError("Failed to fetch")), true);
    assert.equal(isBrowserNetworkFetchError(new Error("unauthorized")), false);
  });
});
