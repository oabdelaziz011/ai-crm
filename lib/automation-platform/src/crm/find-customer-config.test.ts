import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultFindCustomerConfig, normalizeFindCustomerConfig } from "./find-customer-config.js";
import { staticBinding, variableBinding } from "../field-binding/normalize.js";

describe("normalizeFindCustomerConfig", () => {
  it("normalizes lookupBy and value binding", () => {
    const normalized = normalizeFindCustomerConfig({
      lookupBy: "email",
      value: staticBinding("test@example.com"),
    });

    assert.equal(normalized.lookupBy, "email");
    assert.deepEqual(normalized.value, staticBinding("test@example.com"));
  });

  it("defaults lookupBy to phone and value to empty static binding", () => {
    const normalized = normalizeFindCustomerConfig({});
    assert.equal(normalized.lookupBy, "phone");
    assert.deepEqual(normalized.value, staticBinding(""));
  });

  it("creates default config with phone variable binding", () => {
    const defaults = createDefaultFindCustomerConfig();
    assert.equal(defaults.lookupBy, "phone");
    assert.deepEqual(defaults.value, variableBinding("phone"));
  });
});
