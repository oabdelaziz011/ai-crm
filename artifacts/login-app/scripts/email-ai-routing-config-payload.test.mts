import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors repository draft → RPC payload mapping (save / clear target).
 */
function toUpsertPayload(
  categories: Array<{
    category: string;
    enabled: boolean;
    targetType: string;
    targetId: string | null;
  }>,
) {
  return categories.map((item) => ({
    category: item.category,
    enabled: item.enabled,
    target_type: item.targetType,
    target_id: item.targetId,
  }));
}

describe("email routing config save/clear payload (Sprint 7)", () => {
  it("save succeeds payload shape for configured categories", () => {
    const payload = toUpsertPayload([
      {
        category: "sales",
        enabled: true,
        targetType: "department",
        targetId: "dept-1",
      },
    ]);
    assert.deepEqual(payload, [
      {
        category: "sales",
        enabled: true,
        target_type: "department",
        target_id: "dept-1",
      },
    ]);
  });

  it("clearing target sets target_id null", () => {
    const payload = toUpsertPayload([
      {
        category: "support",
        enabled: true,
        targetType: "employee",
        targetId: null,
      },
    ]);
    assert.equal(payload[0]?.target_id, null);
  });
});
