import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyManualMapping, assertMappingReady, suggestFieldMappings } from "./map-fields.js";

describe("customer import field mapping", () => {
  it("suggests aliases without inventing low-confidence matches", () => {
    const suggested = suggestFieldMappings([
      { index: 0, header: "Client Name", samples: ["Sara"] },
      { index: 1, header: "E-mail", samples: ["a@b.com"] },
      { index: 2, header: "Weird Column", samples: ["x"] },
    ]);
    assert.equal(suggested[0]?.targetFieldId, "name");
    assert.equal(suggested[1]?.targetFieldId, "email");
    assert.equal(suggested[2]?.targetFieldId, null);
    assert.equal(suggested[2]?.confidence, "none");
  });

  it("keeps target mappings unique", () => {
    const base = suggestFieldMappings([
      { index: 0, header: "name", samples: [] },
      { index: 1, header: "full name", samples: [] },
    ]);
    assert.equal(base[0]?.targetFieldId, "name");
    assert.equal(base[1]?.targetFieldId, null);

    const remapped = applyManualMapping(base, 1, "name");
    assert.equal(remapped[0]?.targetFieldId, null);
    assert.equal(remapped[1]?.targetFieldId, "name");
    assert.deepEqual(assertMappingReady(remapped), { ok: true });
  });
});
