import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confirmOrderCancellation,
  getOrderCancellationEligibility,
  listCustomerOrdersForCancellation,
} from "./order-cancellation-from-conversation.js";
import type { SalesOrderToolPorts } from "./sales-order-ports.js";

function makePorts(overrides: Partial<SalesOrderToolPorts> = {}): SalesOrderToolPorts {
  const orders = [
    {
      id: "o1",
      orderNumber: "SO-1",
      status: "confirmed",
      totalAmount: 100,
      currency: "EGP",
      customerName: "Ahmed",
      customerPhone: "+201111111111",
      hasPendingCancellationRequest: false,
    },
  ];
  return {
    loadOrderSettings: async () => {
      throw new Error("unused");
    },
    resolveCatalogLines: async () => [],
    matchDeliveryZone: async () => null,
    nextOrderNumber: async () => "SO-X",
    createOrder: async () => {
      throw new Error("unused");
    },
    listCustomerActiveOrders: async () => orders,
    resolveConversationCustomerPhone: async () => "+201111111111",
    executeCustomerDirectCancellation: async () => ({ ok: true as const, workerNotify: null }),
    createCustomerCancellationRequest: async () => ({
      ok: true as const,
      requestId: "req-1",
    }),
    ...overrides,
  } as SalesOrderToolPorts;
}

describe("order cancellation from conversation", () => {
  it("requires ownership phone", async () => {
    const ports = makePorts({
      resolveConversationCustomerPhone: async () => null,
      listCustomerActiveOrders: async () => [],
    });
    const result = await listCustomerOrdersForCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      customerPhone: null,
    });
    assert.equal(result.code, "ownership_verification_required");
  });

  it("lists owned orders only", async () => {
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "o1",
          orderNumber: "SO-1",
          status: "confirmed",
          totalAmount: 100,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
        {
          id: "o2",
          orderNumber: "SO-2",
          status: "confirmed",
          totalAmount: 50,
          currency: "EGP",
          customerName: "Other",
          customerPhone: "+209999999999",
          hasPendingCancellationRequest: false,
        },
      ],
    });
    const result = await listCustomerOrdersForCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      customerPhone: "+201111111111",
    });
    assert.equal(result.code, "orders_listed");
    assert.equal(result.orders?.length, 1);
    assert.equal(result.orders?.[0]?.orderNumber, "SO-1");
  });

  it("asks which order when multiple active", async () => {
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "o1",
          orderNumber: "SO-1",
          status: "confirmed",
          totalAmount: 100,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
        {
          id: "o2",
          orderNumber: "SO-2",
          status: "processing",
          totalAmount: 50,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
      ],
    });
    const result = await getOrderCancellationEligibility(ports, {
      companyId: "c1",
      conversationId: "v1",
      customerPhone: "+201111111111",
    });
    assert.equal(result.code, "multiple_orders");
  });

  it("blocks confirm without explicit confirmation", async () => {
    const ports = makePorts();
    const result = await confirmOrderCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      orderId: "o1",
      customerConfirmed: false,
      customerPhone: "+201111111111",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "confirmation_required");
  });

  it("direct-cancels confirmed after confirmation", async () => {
    let called = false;
    const ports = makePorts({
      executeCustomerDirectCancellation: async () => {
        called = true;
        return { ok: true as const, workerNotify: null };
      },
    });
    const result = await confirmOrderCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      orderId: "o1",
      customerConfirmed: true,
      customerPhone: "+201111111111",
    });
    assert.equal(called, true);
    assert.equal(result.code, "cancellation_completed");
  });

  it("creates request for processing orders", async () => {
    let called = false;
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "o1",
          orderNumber: "SO-1",
          status: "processing",
          totalAmount: 100,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
      ],
      createCustomerCancellationRequest: async () => {
        called = true;
        return { ok: true as const, requestId: "req-9" };
      },
    });
    const result = await confirmOrderCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      orderId: "o1",
      customerConfirmed: true,
      customerPhone: "+201111111111",
    });
    assert.equal(called, true);
    assert.equal(result.code, "cancellation_request_created");
    assert.equal(result.requestId, "req-9");
  });

  it("rejects delivered orders", async () => {
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "o1",
          orderNumber: "SO-1",
          status: "delivered",
          totalAmount: 100,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
      ],
    });
    const result = await confirmOrderCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      orderId: "o1",
      customerConfirmed: true,
      customerPhone: "+201111111111",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "cancellation_not_allowed");
  });

  it("returns already cancelled idempotently", async () => {
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "o1",
          orderNumber: "SO-1",
          status: "cancelled",
          totalAmount: 100,
          currency: "EGP",
          customerName: "Ahmed",
          customerPhone: "+201111111111",
          hasPendingCancellationRequest: false,
        },
      ],
    });
    const result = await confirmOrderCancellation(ports, {
      companyId: "c1",
      conversationId: "v1",
      orderId: "o1",
      customerConfirmed: true,
      customerPhone: "+201111111111",
    });
    assert.equal(result.code, "cancellation_already_completed");
  });
});
