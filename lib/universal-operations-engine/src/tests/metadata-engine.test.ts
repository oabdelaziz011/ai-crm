import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metadataEngine, queueDataEngine } from "../engine/metadata-engine.js";
import { MOCK_CLINIC_CONFIG } from "../mock/mock-workspace-config.js";
import { MOCK_QUEUE_ROWS } from "../mock/mock-queue-data.js";

describe("MetadataEngine", () => {
  it("resolves display names from column metadata", () => {
    assert.equal(metadataEngine.resolveDisplayName(MOCK_CLINIC_CONFIG, "customer"), "Patient");
  });

  it("returns visible columns in order", () => {
    const columns = metadataEngine.visibleColumns(MOCK_CLINIC_CONFIG);
    assert.ok(columns.length > 0);
    assert.equal(columns[0]?.internalName, "reference");
  });

  it("applies column rename without changing internal name", () => {
    const col = MOCK_CLINIC_CONFIG.columns.find((c) => c.internalName === "customer")!;
    const updated = metadataEngine.applyColumnPatch(MOCK_CLINIC_CONFIG, col.id, { displayName: "Client" });
    assert.equal(updated.columns.find((c) => c.id === col.id)?.displayName, "Client");
    assert.equal(updated.columns.find((c) => c.id === col.id)?.internalName, "customer");
  });
});

describe("QueueDataEngine", () => {
  it("paginates mock rows", () => {
    const page = queueDataEngine.paginate(MOCK_QUEUE_ROWS, {
      companyId: "mock-company",
      page: 1,
      pageSize: 25,
    });
    assert.equal(page.rows.length, 25);
    assert.equal(page.total, MOCK_QUEUE_ROWS.length);
    assert.equal(page.hasMore, true);
  });

  it("filters rows by global search", () => {
    const firstName = String(MOCK_QUEUE_ROWS[0]?.values.customer ?? "");
    const page = queueDataEngine.paginate(MOCK_QUEUE_ROWS, {
      companyId: "mock-company",
      page: 1,
      pageSize: 50,
      search: firstName.split(" ")[0],
    });
    assert.ok(page.total >= 1);
  });
});
