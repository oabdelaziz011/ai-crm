import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeCustomerListPresenceTags } from "./customer-entity-notes-merge.ts";

describe("mergeCustomerListPresenceTags", () => {
  it("adds notes from entity notes and channel history tags", () => {
    const rows = [
      { customer: { id: "c1", notes: null }, tags: ["email", "phone", "vip"] },
      { customer: { id: "c2", notes: "" }, tags: [] },
    ];
    const channels = new Map([
      ["c1", new Set(["whatsapp", "email"] as const)],
      ["c2", new Set(["sms"] as const)],
    ]);
    const merged = mergeCustomerListPresenceTags(rows, {
      entityNoteCustomerIds: new Set(["c1"]),
      channelContacts: channels,
    });
    assert.ok(merged[0]?.tags.includes("notes"));
    assert.ok(merged[0]?.tags.includes("whatsapp"));
    assert.ok(merged[0]?.tags.includes("email"));
    assert.ok(!merged[0]?.tags.includes("phone"));
    assert.ok(merged[0]?.tags.includes("vip"));
    assert.deepEqual(merged[1]?.tags.sort(), ["sms"]);
  });

  it("tags legacy pinned notes when presence sets are empty", () => {
    const rows = [{ customer: { id: "c1", notes: "pinned" }, tags: ["email"] }];
    const merged = mergeCustomerListPresenceTags(rows, {});
    assert.ok(merged[0]?.tags.includes("notes"));
    assert.ok(!merged[0]?.tags.includes("email"));
  });
});
