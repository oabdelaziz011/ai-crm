import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCancellationNotificationRow,
  insertIdempotentCancellationNotification,
} from "./cancellation-notification-helper.js";

describe("cancellation notification helper", () => {
  it("builds schema-correct rows with idempotency key", () => {
    const row = buildCancellationNotificationRow({
      companyId: "c1",
      userId: "u1",
      kind: "completed",
      detail: "Order SO-1 cancelled",
      idempotencyKey: "order-cancel-notice:o1:confirmed:u1",
      orderId: "o1",
      orderNumber: "SO-1",
    });
    assert.equal(row.title, "Customer Order Cancelled");
    assert.equal(row.category, "system");
    assert.equal(row.idempotency_key, "order-cancel-notice:o1:confirmed:u1");
    assert.equal("body" in row, false);
    assert.equal("params" in row, false);
    const payload = JSON.parse(row.message);
    assert.equal(payload.params.orderNumber, "SO-1");
    assert.match(payload.messageKey, /genericSystem/);
  });

  it("treats unique violations as duplicates", async () => {
    const client = {
      from() {
        return {
          insert() {
            return {
              select() {
                return {
                  async maybeSingle() {
                    return {
                      data: null,
                      error: { message: "duplicate key value violates unique constraint", code: "23505" },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const result = await insertIdempotentCancellationNotification(
      client,
      buildCancellationNotificationRow({
        companyId: "c1",
        userId: "u1",
        kind: "request_pending",
        detail: "pending",
        idempotencyKey: "k1",
        orderId: "o1",
        orderNumber: "SO-1",
      }),
    );
    assert.equal(result.duplicate, true);
    assert.equal(result.inserted, false);
  });
});
