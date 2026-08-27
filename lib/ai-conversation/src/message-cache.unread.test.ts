import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveUnreadDelta } from "./message-cache.js";

describe("resolveUnreadDelta", () => {
  it("increments employee unread for incoming only", () => {
    assert.deepEqual(resolveUnreadDelta("incoming"), { employee: 1, customer: 0 });
    assert.deepEqual(resolveUnreadDelta("outgoing"), { employee: 0, customer: 1 });
    assert.deepEqual(resolveUnreadDelta("system"), { employee: 0, customer: 0 });
  });

  it("outgoing delta must not imply employee unread patch", () => {
    const outgoing = resolveUnreadDelta("outgoing");
    assert.equal(outgoing.employee, 0);
    assert.ok(outgoing.customer !== 0);
  });
});
