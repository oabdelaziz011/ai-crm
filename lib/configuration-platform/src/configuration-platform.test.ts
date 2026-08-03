import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIGURATION_DOMAINS,
  ConfigurationValidationError,
  validateConfigurationPayload,
  createDefaultConfigurationMetadataEngine,
} from "./index.js";

describe("Configuration Platform — metadata engine", () => {
  it("registers all enterprise configuration domains", () => {
    assert.ok(CONFIGURATION_DOMAINS.includes("operations.workspace"));
    assert.ok(CONFIGURATION_DOMAINS.includes("crm"));
    assert.ok(CONFIGURATION_DOMAINS.includes("billing"));
    assert.ok(CONFIGURATION_DOMAINS.includes("dashboard"));
  });

  it("validates operations workspace metadata fields", () => {
    const engine = createDefaultConfigurationMetadataEngine();
    const normalized = engine.normalize("operations.workspace", {
      workspaceName: "Front Desk",
      moduleName: "Operations",
      rowEntityName: "Visit",
      templateKey: "clinic",
    });
    assert.equal(normalized.workspaceName, "Front Desk");
  });

  it("rejects invalid field types", () => {
    assert.throws(
      () =>
        validateConfigurationPayload(
          { workspaceName: 123 },
          [{ key: "workspaceName", label: "Name", type: "text", required: true }],
        ),
      ConfigurationValidationError,
    );
  });

  it("merges configuration patches", () => {
    const engine = createDefaultConfigurationMetadataEngine();
    const merged = engine.mergePatch({ a: 1 }, { b: 2 });
    assert.deepEqual(merged, { a: 1, b: 2 });
  });
});
