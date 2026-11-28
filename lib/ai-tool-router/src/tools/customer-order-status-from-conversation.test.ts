import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SalesOrderToolPorts } from "./sales-order-ports.js";
import {
  getCustomerOrderStatus,
  listCustomerOrders,
} from "./customer-order-status-from-conversation.js";

function makePorts(overrides: Partial<SalesOrderToolPorts> = {}): SalesOrderToolPorts {
  return {
    loadOrderSettings: async () => ({
      aiOrderCollectionEnabled: true,
      requireHumanApproval: true,
      notifyOnPendingApproval: true,
      paymentMethods: ["cash_on_delivery"],
      requiredFields: {
        customerName: true,
        mobileNumber: true,
        governorate: true,
        cityArea: true,
        detailedAddress: true,
        deliveryNotes: false,
        deliveryLocation: false,
        secondaryPhone: false,
      },
    }),
    findEnabledDeliveryZone: async () => ({ status: "none" }),
    priceCatalogLines: async () => ({ ok: false, reason: "unused" }),
    loadConversationAttribution: async () => ({
      aiEmployeeId: null,
      assignedSalespersonId: null,
      sourceChannel: "whatsapp",
      leadId: null,
      existingCustomerId: null,
    }),
    upsertCustomerByPhone: async () => ({ customerId: "c1", created: false }),
    createSalesOrder: async () => ({
      orderId: "o1",
      orderNumber: "SO-1",
      status: "pending_approval",
      customerId: "c1",
      alreadyExisted: false,
    }),
    nextOrderNumber: async () => "SO-1",
    resolveConversationCustomerPhone: async () => "+201011404109",
    listCustomerActiveOrders: async () => [
      {
        id: "ord-1",
        orderNumber: "SO-100",
        status: "out_for_delivery",
        totalAmount: 150,
        currency: "EGP",
        customerName: "Omar",
        customerPhone: "+201011404109",
        hasPendingCancellationRequest: false,
      },
    ],
    executeCustomerDirectCancellation: async () => ({ ok: false, code: "unused", reason: "unused" }),
    createCustomerCancellationRequest: async () => ({ ok: false, code: "unused", reason: "unused" }),
    ...overrides,
  };
}

describe("customer order status lookup", () => {
  it("lists ownership-verified orders from backend statuses only", async () => {
    const result = await listCustomerOrders(makePorts(), {
      companyId: "co-1",
      conversationId: "conv-1",
    });
    assert.equal(result.success, true);
    assert.equal(result.code, "orders_listed");
    assert.equal(result.orders?.[0]?.status, "out_for_delivery");
    assert.equal(result.orders?.[0]?.orderNumber, "SO-100");
  });

  it("fails closed when phone ownership cannot be verified", async () => {
    const result = await listCustomerOrders(
      makePorts({
        resolveConversationCustomerPhone: async () => null,
      }),
      { companyId: "co-1", conversationId: "conv-1" },
    );
    assert.equal(result.success, false);
    assert.equal(result.code, "ownership_verification_required");
  });

  it("returns a single order status and rejects cross-customer order ids", async () => {
    const ports = makePorts({
      listCustomerActiveOrders: async () => [
        {
          id: "ord-1",
          orderNumber: "SO-100",
          status: "processing",
          totalAmount: 90,
          currency: "EGP",
          customerName: "Omar",
          customerPhone: "+201011404109",
          hasPendingCancellationRequest: false,
        },
      ],
    });
    const ok = await getCustomerOrderStatus(ports, {
      companyId: "co-1",
      conversationId: "conv-1",
      orderId: "ord-1",
    });
    assert.equal(ok.success, true);
    assert.equal(ok.order?.status, "processing");

    const denied = await getCustomerOrderStatus(ports, {
      companyId: "co-1",
      conversationId: "conv-1",
      orderId: "ord-other",
    });
    assert.equal(denied.success, false);
    assert.equal(denied.code, "order_not_found");
  });
});
