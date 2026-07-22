import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  beginVariableResolverRegistration,
  freezeVariableResolverRegistry,
  resetVariableResolverRegistryForTests,
} from "../../logic/variable-resolver-registry.js";
import { resolveFieldValue } from "../../logic/expression-engine.js";
import { registerLookupVariableResolver } from "./register-lookup-variable-resolver.js";

beforeEach(() => {
  resetVariableResolverRegistryForTests();
  beginVariableResolverRegistration();
  registerLookupVariableResolver();
  freezeVariableResolverRegistry();
});

describe("LookupVariableResolver", () => {
  it("derives lookup.found from lookup.status without storing found", () => {
    const variables = {
      lookup: { status: "found", count: 1 },
    };

    assert.equal(resolveFieldValue("lookup.status", variables), "found");
    assert.equal(resolveFieldValue("lookup.count", variables), 1);
    assert.equal(resolveFieldValue("lookup.found", variables), true);
    assert.equal(Object.prototype.hasOwnProperty.call(variables.lookup, "found"), false);
  });

  it("returns false for lookup.found when duplicate", () => {
    const variables = {
      lookup: { status: "duplicate", count: 2 },
    };

    assert.equal(resolveFieldValue("lookup.found", variables), false);
  });

  it("returns false for lookup.found when lookup object is missing", () => {
    assert.equal(resolveFieldValue("lookup.found", {}), false);
  });
});
