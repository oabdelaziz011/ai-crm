import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

describe("demo_completed Kanban display labels (Opportunity / فرصة)", () => {
  it("EN and AR locales map demo_completed to Opportunity / فرصة without renaming the key", () => {
    const en = JSON.parse(readFileSync(resolve(root, "src/locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(resolve(root, "src/locales/ar/common.json"), "utf8"));

    assert.equal(en.leads.stages.demo_completed, "Opportunity");
    assert.equal(en.leads.lifecycle.demo_completed, "Opportunity");
    assert.equal(ar.leads.stages.demo_completed, "فرصة");
    assert.equal(ar.leads.lifecycle.demo_completed, "فرصة");

    // Persisted identifier must remain the English lifecycle token in JSON keys.
    assert.ok("demo_completed" in en.leads.stages);
    assert.ok("demo_completed" in ar.leads.stages);
    assert.notEqual(ar.leads.stages.demo_completed, "اكتملت التجربة");
    assert.notEqual(en.leads.stages.demo_completed, "Demo completed");
  });
});
