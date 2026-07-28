import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readInteractiveListInputKey,
  readInteractiveListOutputVariable,
  resolveInteractiveListStoredRecord,
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

  it("reads outputVariable with saveAs fallback", () => {
    assert.equal(readInteractiveListOutputVariable({ outputVariable: "selected_service" }), "selected_service");
    assert.equal(readInteractiveListOutputVariable({ saveAs: "selected_customer" }), "selected_customer");
  });

  it("resolves stored lookup record by reply id", () => {
    const lookupConfig = {
      outputVariable: "selected_service",
      sections: [
        {
          title: "Options",
          rows: [
            {
              id: "svc_1",
              title: "Consultation",
              value: "svc_1",
              record: {
                id: "svc_1",
                name: "Consultation",
                duration_minutes: 30,
                status: "active",
              },
            },
          ],
        },
      ],
    };

    assert.deepEqual(resolveInteractiveListStoredRecord(lookupConfig, "svc_1"), {
      id: "svc_1",
      name: "Consultation",
      duration_minutes: 30,
      status: "active",
    });
    assert.equal(resolveInteractiveListStoredRecord(lookupConfig, "missing"), null);
  });
});
