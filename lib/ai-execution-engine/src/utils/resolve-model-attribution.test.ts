import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModel } from "./execution-utils.js";

describe("resolveModel attribution", () => {
  it("prefers explicit employee model over platform/connection defaults", () => {
    assert.equal(resolveModel({ model: "gpt-4o-mini" }, "gpt-4.1-mini"), "gpt-4.1-mini");
    assert.equal(resolveModel({ model: "gpt-4o-mini" }, "mistral-small-latest"), "mistral-small-latest");
    assert.equal(resolveModel({ model: "gpt-4o-mini" }, "gemini-2.5-flash"), "gemini-2.5-flash");
  });

  it("falls back to connection model then default-model", () => {
    assert.equal(resolveModel({ model: "mistral-small-latest" }, null), "mistral-small-latest");
    assert.equal(resolveModel({}, null), "default-model");
  });
});
