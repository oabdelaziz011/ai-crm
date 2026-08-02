import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeApiBase } from "./normalize-api-base.js";

describe("normalizeApiBase", () => {
  it("appends /api to server root URLs", () => {
    assert.equal(normalizeApiBase("https://webhook.valueor.org"), "https://webhook.valueor.org/api");
    assert.equal(normalizeApiBase("http://localhost:3001"), "http://localhost:3001/api");
  });

  it("does not double-append /api when already present", () => {
    assert.equal(normalizeApiBase("https://webhook.valueor.org/api"), "https://webhook.valueor.org/api");
    assert.equal(normalizeApiBase("http://localhost:3001/api"), "http://localhost:3001/api");
  });

  it("strips trailing slashes before normalizing", () => {
    assert.equal(normalizeApiBase("https://webhook.valueor.org/"), "https://webhook.valueor.org/api");
    assert.equal(normalizeApiBase("https://webhook.valueor.org/api/"), "https://webhook.valueor.org/api");
    assert.equal(normalizeApiBase("http://localhost:3001///"), "http://localhost:3001/api");
  });

  it("returns empty string for blank input", () => {
    assert.equal(normalizeApiBase(""), "");
    assert.equal(normalizeApiBase("   "), "");
  });
});
