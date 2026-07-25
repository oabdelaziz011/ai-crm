import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readInteractiveListInputKey,
  resolveInteractiveListStoredValue,
} from "./interactive-list-variable.js";

describe("interactive list variable binding", () => {
  const config = {
    action: "send_list",
    inputKey: "customer_gender",
    sections: [
      {
        title: "Gender",
        rows: [
          { id: "male", title: "Male" },
          { id: "female_id", title: "Female", value: "female" },
        ],
      },
    ],
  };

  it("reads inputKey and legacy saveAs", () => {
    assert.equal(readInteractiveListInputKey({ inputKey: "customer_gender" }), "customer_gender");
    assert.equal(readInteractiveListInputKey({ saveAs: "legacy_key" }), "legacy_key");
    assert.equal(readInteractiveListInputKey({}), null);
  });

  it("stores row id when value is not configured", () => {
    assert.equal(resolveInteractiveListStoredValue(config, "male"), "male");
  });

  it("stores explicit row value when configured", () => {
    assert.equal(resolveInteractiveListStoredValue(config, "female_id"), "female");
  });

  it("falls back to reply id when row is unknown", () => {
    assert.equal(resolveInteractiveListStoredValue(config, "unknown"), "unknown");
  });

  it("returns null for empty reply id", () => {
    assert.equal(resolveInteractiveListStoredValue(config, ""), null);
    assert.equal(resolveInteractiveListStoredValue(config, "   "), null);
  });
});
