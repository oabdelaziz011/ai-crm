import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDefaultConnection } from "./resolve-tenant-runtime-config.js";

describe("resolveTenantRuntimeConfig helpers", () => {
  it("returns null when no enabled connections exist", () => {
    assert.equal(pickDefaultConnection([]), null);
  });
});
