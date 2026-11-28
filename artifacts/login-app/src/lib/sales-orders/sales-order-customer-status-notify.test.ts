import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCustomerOrderStatusMessage } from "./sales-order-customer-status-notify.js";

describe("buildCustomerOrderStatusMessage", () => {
  it("covers required lifecycle statuses without inventing unknown states", () => {
    assert.match(
      buildCustomerOrderStatusMessage({
        orderNumber: "SO-1",
        status: "pending_approval",
        customerName: "Omar",
      }),
      /pending team approval/i,
    );
    assert.match(
      buildCustomerOrderStatusMessage({
        orderNumber: "SO-1",
        status: "confirmed",
        customerName: "Omar",
      }),
      /confirmed/i,
    );
    assert.match(
      buildCustomerOrderStatusMessage({
        orderNumber: "SO-1",
        status: "out_for_delivery",
        customerName: "Omar",
      }),
      /out for delivery/i,
    );
    assert.match(
      buildCustomerOrderStatusMessage({
        orderNumber: "SO-1",
        status: "delivered",
        customerName: "Omar",
      }),
      /delivered/i,
    );
  });
});
