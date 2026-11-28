import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSalesOrderFromConfirmedConversation,
  previewSalesOrderFromConversation,
  validateDeliveryZoneForOrder,
} from "./create-sales-order-from-conversation.js";
import type { SalesOrderToolPorts } from "./sales-order-ports.js";

function createPorts(overrides: Partial<SalesOrderToolPorts> = {}): SalesOrderToolPorts {
  const zone = {
    id: "zone-1",
    governorate: "Cairo",
    zoneName: "Nasr City",
    deliveryFee: 40,
    etaMin: 1,
    etaMax: 2,
    etaUnit: "days" as const,
  };
  const base: SalesOrderToolPorts = {
    async loadOrderSettings() {
      return {
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
          secondaryPhone: true,
        },
      };
    },
    async findEnabledDeliveryZone() {
      return { status: "ok" as const, zone };
    },
    async priceCatalogLines({ items }) {
      return {
        ok: true,
        currency: "EGP",
        subtotal: items.reduce((sum, item) => sum + item.quantity * 100, 0),
        lines: items.map((item) => ({
          productId: item.productId,
          productName: "Demo Product",
          productSku: "SKU",
          quantity: item.quantity,
          unitPrice: 100,
          lineTotal: item.quantity * 100,
          currency: "EGP",
        })),
      };
    },
    async loadConversationAttribution() {
      return {
        aiEmployeeId: "ai-emp-1",
        assignedSalespersonId: "human-1",
        sourceChannel: "web_chat",
        leadId: "lead-1",
        existingCustomerId: null,
      };
    },
    async upsertCustomerByPhone() {
      return { customerId: "cust-1", created: true };
    },
    async nextOrderNumber() {
      return "SO-TEST-0001";
    },
    async createSalesOrder(input) {
      assert.equal(input.aiEmployeeId, "ai-emp-1");
      assert.equal(input.assignedSalespersonId, "human-1");
      assert.notEqual(input.aiEmployeeId, input.assignedSalespersonId);
      assert.equal(input.paymentStatus, "unpaid");
      assert.equal(input.status, "pending_approval");
      return {
        orderId: "order-1",
        orderNumber: input.orderNumber,
        status: input.status,
        customerId: input.customerId,
        alreadyExisted: false,
      };
    },
    async cancelFollowUpAfterPurchase() {},
  };
  return { ...base, ...overrides };
}

const baseInput = {
  companyId: "co-1",
  conversationId: "conv-1",
  userId: "user-1",
  items: [{ productId: "prod-1", quantity: 2 }],
  customerName: "Omar Test",
  customerPhone: "+201000000001",
  governorate: "Cairo",
  zoneName: "Nasr City",
  deliveryAddress: "Street 1",
};

describe("createSalesOrderFromConfirmedConversation", () => {
  it("blocks when AI order collection is disabled", async () => {
    const ports = createPorts({
      async loadOrderSettings() {
        return {
          aiOrderCollectionEnabled: false,
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
            secondaryPhone: true,
          },
        };
      },
    });
    const result = await createSalesOrderFromConfirmedConversation(ports, {
      ...baseInput,
      customerConfirmed: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "ai_order_collection_disabled");
  });

  it("requires explicit customer confirmation", async () => {
    const result = await createSalesOrderFromConfirmedConversation(createPorts(), {
      ...baseInput,
      customerConfirmed: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "confirmation_required");
  });

  it("fails closed for unsupported delivery zones", async () => {
    const ports = createPorts({
      async findEnabledDeliveryZone() {
        return { status: "none" as const };
      },
    });
    const zone = await validateDeliveryZoneForOrder(ports, {
      companyId: "co-1",
      governorate: "Unknown",
      zoneName: "Nowhere",
    });
    assert.equal(zone.ok, false);
    if (!zone.ok) assert.equal(zone.code, "zone_unsupported");
  });

  it("asks for clarification when multiple zones match", async () => {
    const ports = createPorts({
      async findEnabledDeliveryZone() {
        return {
          status: "ambiguous" as const,
          candidates: [
            { id: "z1", governorate: "Cairo", zoneName: "Nasr City" },
            { id: "z2", governorate: "Cairo", zoneName: "New Cairo" },
          ],
        };
      },
    });
    const zone = await validateDeliveryZoneForOrder(ports, {
      companyId: "co-1",
      governorate: "Cairo",
      zoneName: "Nasr",
    });
    assert.equal(zone.ok, false);
    if (!zone.ok) {
      assert.equal(zone.code, "zone_ambiguous");
      assert.equal(zone.candidates?.length, 2);
    }
  });

  it("previews totals without writing and creates pending_approval after confirm", async () => {
    let wrote = false;
    const ports = createPorts({
      async createSalesOrder(input) {
        wrote = true;
        return {
          orderId: "order-1",
          orderNumber: input.orderNumber,
          status: input.status,
          customerId: input.customerId,
          alreadyExisted: false,
        };
      },
    });
    const preview = await previewSalesOrderFromConversation(ports, baseInput);
    assert.equal(preview.ok, true);
    assert.equal(wrote, false);
    if (preview.ok) {
      assert.equal(preview.subtotal, 200);
      assert.equal(preview.deliveryFee, 40);
      assert.equal(preview.totalAmount, 240);
    }
    const created = await createSalesOrderFromConfirmedConversation(ports, {
      ...baseInput,
      customerConfirmed: true,
    });
    assert.equal(created.ok, true);
    assert.equal(wrote, true);
    if (created.ok) {
      assert.equal(created.status, "pending_approval");
      assert.equal(created.paymentStatus, "unpaid");
      assert.equal(created.requireHumanApproval, true);
    }
  });
});
