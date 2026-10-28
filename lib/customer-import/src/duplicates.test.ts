import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExistingCustomerMatchIndex,
  detectDuplicateCandidates,
} from "./duplicates.js";
import type { NormalizedImportRow } from "./types.js";

describe("customer import duplicates", () => {
  it("matches email and phone_e164 conservatively", () => {
    const rows: NormalizedImportRow[] = [
      { rowNumber: 2, values: { name: "A", email: "a@example.com" }, issues: [] },
      { rowNumber: 3, values: { name: "B", phone: "+201000000001" }, issues: [] },
      { rowNumber: 4, values: { name: "C", email: "a@example.com" }, issues: [] },
    ];
    const index = buildExistingCustomerMatchIndex([
      { id: "c1", email: "a@example.com", phone_e164: null },
      { id: "c2", email: null, phone_e164: "+201000000001" },
    ]);
    const dups = detectDuplicateCandidates(rows, index, "skip");
    assert.ok(dups.some((dup) => dup.rowNumber === 2 && dup.matchKind === "email"));
    assert.ok(dups.some((dup) => dup.rowNumber === 3 && dup.matchKind === "phone_e164"));
    assert.ok(dups.some((dup) => dup.rowNumber === 4 && dup.matchKind === "file_internal"));
  });
});
