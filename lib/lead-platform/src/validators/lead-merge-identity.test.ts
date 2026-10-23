import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadsShareVerifiedIdentity, normalizeLeadEmail, normalizeLeadPhone } from "./lead-merge-identity.js";

describe("lead merge identity", () => {
  it("matches phones after digit normalization", () => {
    assert.equal(normalizeLeadPhone("+20 100 000 0001"), "201000000001");
    assert.equal(normalizeLeadPhone("01000000001"), "201000000001");
    assert.equal(
      leadsShareVerifiedIdentity({ phone: "+201000000001", email: null }, { phone: "01000000001", email: null }),
      true,
    );
  });

  it("does not treat unrelated international last-10 collisions as the same person", () => {
    // Different country prefixes that happen to share last 10 digits must not merge.
    assert.equal(
      leadsShareVerifiedIdentity(
        { phone: "+441000000001", email: null },
        { phone: "+331000000001", email: null },
      ),
      false,
    );
  });

  it("matches emails case-insensitively", () => {
    assert.equal(normalizeLeadEmail(" Ada@Example.COM "), "ada@example.com");
    assert.equal(
      leadsShareVerifiedIdentity({ phone: null, email: "Ada@Example.COM" }, { phone: null, email: "ada@example.com" }),
      true,
    );
  });

  it("rejects name-only similarity and incomplete contact data", () => {
    assert.equal(
      leadsShareVerifiedIdentity(
        { phone: "01000000001", email: "a@example.com" },
        { phone: "01000000002", email: "b@example.com" },
      ),
      false,
    );
    assert.equal(normalizeLeadPhone("123"), null);
    assert.equal(normalizeLeadEmail("not-an-email"), null);
  });
});
