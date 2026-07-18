import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacSha256Hex, randomUUID, sha256Hex, verifyHmacSha256Hex } from "./index.js";

describe("platform-crypto", () => {
  it("generates UUIDs", () => {
    const id = randomUUID();
    assert.match(id, /^[0-9a-f-]{36}$/);
  });

  it("hashes strings", () => {
    assert.equal(
      sha256Hex("hello"),
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("verifies HMAC", async () => {
    const secret = "test-secret";
    const payload = '{"entry":[]}';
    const digest = await hmacSha256Hex(secret, payload);
    assert.equal(await verifyHmacSha256Hex({ secret, payload, expectedHex: digest }), true);
    assert.equal(await verifyHmacSha256Hex({ secret, payload, expectedHex: "deadbeef" }), false);
  });
});
