/**
 * Server-side sales order creation from an AI conversation.
 * Gates: ai_order_collection_enabled, explicit customerConfirmed, catalog prices, enabled zones.
 * Never invents fees/prices. Never sets salesperson = AI employee.
 */

import { createHash } from "node:crypto";
import type {
  CatalogPricedLine,
  CompanyOrderSettingsSnapshot,
  CreateSalesOrderWriteResult,
  DeliveryZoneSnapshot,
  SalesOrderToolPorts,
} from "./sales-order-ports.js";
import { SALES_ORDER_MAX_LINE_QUANTITY, SALES_ORDER_MAX_LINES } from "./sales-order-tool-definitions.js";

export type SalesOrderLineInput = {
  productId: string;
  quantity: number;
};

export type CreateSalesOrderFromConversationInput = {
  companyId: string;
  conversationId: string;
  userId: string | null;
  aiAssistantIdHint?: string | null;
  customerConfirmed: boolean;
  items: SalesOrderLineInput[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  preferredLanguage?: string;
  governorate: string;
  zoneName: string;
  deliveryAddress: string;
  deliveryNotes?: string;
  deliveryLocationUrl?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
};

export type PreviewSalesOrderInput = Omit<
  CreateSalesOrderFromConversationInput,
  "customerConfirmed" | "deliveryAddress" | "deliveryNotes" | "deliveryLocationUrl" | "deliveryLat" | "deliveryLng"
> & {
  deliveryAddress?: string;
};

export type SalesOrderToolResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      status: string;
      requireHumanApproval: boolean;
      customerId: string;
      alreadyExisted: boolean;
      paymentStatus: "unpaid";
      totalAmount: number;
      currency: string;
      message: string;
    }
  | {
      ok: false;
      reason: string;
      code:
        | "ai_order_collection_disabled"
        | "confirmation_required"
        | "missing_required_field"
        | "zone_unsupported"
        | "pricing_failed"
        | "invalid_items"
        | "write_failed";
    };

export type PreviewSalesOrderResult =
  | {
      ok: true;
      supported: true;
      lines: CatalogPricedLine[];
      subtotal: number;
      deliveryFee: number;
      totalAmount: number;
      currency: string;
      zone: DeliveryZoneSnapshot;
      requireHumanApproval: boolean;
      message: string;
    }
  | {
      ok: false;
      reason: string;
      code:
        | "ai_order_collection_disabled"
        | "zone_unsupported"
        | "pricing_failed"
        | "invalid_items"
        | "missing_required_field";
    };

export type ValidateDeliveryZoneResult =
  | {
      ok: true;
      supported: true;
      zone: DeliveryZoneSnapshot;
      message: string;
    }
  | {
      ok: false;
      supported: false;
      reason: string;
      code: "ai_order_collection_disabled" | "zone_unsupported" | "missing_required_field";
    };

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function clampQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const q = Math.trunc(value);
  if (q < 1 || q > SALES_ORDER_MAX_LINE_QUANTITY) return null;
  return q;
}

export function normalizeSalesOrderItems(raw: unknown): SalesOrderLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SALES_ORDER_MAX_LINES) return null;
  const out: SalesOrderLineInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const productId = trim((entry as Record<string, unknown>).productId);
    const quantity = clampQuantity((entry as Record<string, unknown>).quantity);
    if (!productId || quantity == null) return null;
    out.push({ productId, quantity });
  }
  return out;
}

function defaultRequiredFields(): CompanyOrderSettingsSnapshot["requiredFields"] {
  return {
    customerName: true,
    mobileNumber: true,
    governorate: true,
    cityArea: true,
    detailedAddress: true,
    deliveryNotes: false,
  };
}

function missingRequired(
  settings: CompanyOrderSettingsSnapshot,
  fields: {
    customerName: string;
    customerPhone: string;
    governorate: string;
    zoneName: string;
    deliveryAddress: string;
    deliveryNotes: string;
    requireAddress: boolean;
  },
): string | null {
  const req = { ...defaultRequiredFields(), ...settings.requiredFields };
  if (req.customerName && !fields.customerName) return "customerName";
  if (req.mobileNumber && !fields.customerPhone) return "customerPhone";
  if (req.governorate && !fields.governorate) return "governorate";
  if (req.cityArea && !fields.zoneName) return "zoneName";
  if (fields.requireAddress && req.detailedAddress && !fields.deliveryAddress) return "deliveryAddress";
  if (req.deliveryNotes && !fields.deliveryNotes) return "deliveryNotes";
  return null;
}

function buildFingerprint(input: {
  conversationId: string;
  customerPhone: string;
  governorate: string;
  zoneName: string;
  deliveryAddress: string;
  items: SalesOrderLineInput[];
}): string {
  const payload = JSON.stringify({
    conversationId: input.conversationId,
    phone: input.customerPhone.toLowerCase(),
    governorate: input.governorate.toLowerCase(),
    zone: input.zoneName.toLowerCase(),
    address: input.deliveryAddress.toLowerCase(),
    items: input.items
      .map((i) => `${i.productId}:${i.quantity}`)
      .sort(),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 48);
}

export async function validateDeliveryZoneForOrder(
  ports: SalesOrderToolPorts,
  input: { companyId: string; governorate: string; zoneName: string },
): Promise<ValidateDeliveryZoneResult> {
  const settings = await ports.loadOrderSettings(input.companyId);
  if (!settings.aiOrderCollectionEnabled) {
    return {
      ok: false,
      supported: false,
      reason: "AI order collection is disabled for this company.",
      code: "ai_order_collection_disabled",
    };
  }
  const governorate = trim(input.governorate);
  const zoneName = trim(input.zoneName);
  if (!governorate || !zoneName) {
    return {
      ok: false,
      supported: false,
      reason: "governorate and zoneName are required.",
      code: "missing_required_field",
    };
  }
  const zone = await ports.findEnabledDeliveryZone({
    companyId: input.companyId,
    governorate,
    zoneName,
  });
  if (!zone) {
    return {
      ok: false,
      supported: false,
      reason: "Delivery is not available for this governorate/area. Do not invent a fee or ETA.",
      code: "zone_unsupported",
    };
  }
  return {
    ok: true,
    supported: true,
    zone,
    message: "Zone is supported. Use only the returned fee and ETA.",
  };
}

export async function previewSalesOrderFromConversation(
  ports: SalesOrderToolPorts,
  input: PreviewSalesOrderInput,
): Promise<PreviewSalesOrderResult> {
  const settings = await ports.loadOrderSettings(input.companyId);
  if (!settings.aiOrderCollectionEnabled) {
    return {
      ok: false,
      reason: "AI order collection is disabled for this company.",
      code: "ai_order_collection_disabled",
    };
  }

  const items = input.items;
  if (!items.length) {
    return { ok: false, reason: "At least one catalog item is required.", code: "invalid_items" };
  }

  const customerName = trim(input.customerName);
  const customerPhone = trim(input.customerPhone);
  const governorate = trim(input.governorate);
  const zoneName = trim(input.zoneName);
  // Preview totals before notes are collected; create_sales_order still enforces deliveryNotes.
  const missing = missingRequired(
    { ...settings, requiredFields: { ...settings.requiredFields, deliveryNotes: false } },
    {
      customerName,
      customerPhone,
      governorate,
      zoneName,
      deliveryAddress: trim(input.deliveryAddress),
      deliveryNotes: "",
      requireAddress: false,
    },
  );
  if (missing) {
    return {
      ok: false,
      reason: `Missing required field: ${missing}`,
      code: "missing_required_field",
    };
  }

  const zone = await ports.findEnabledDeliveryZone({
    companyId: input.companyId,
    governorate,
    zoneName,
  });
  if (!zone) {
    return {
      ok: false,
      reason: "Delivery is not available for this governorate/area.",
      code: "zone_unsupported",
    };
  }

  const priced = await ports.priceCatalogLines({ companyId: input.companyId, items });
  if (!priced.ok) {
    return { ok: false, reason: priced.reason, code: "pricing_failed" };
  }

  const totalAmount = Number((priced.subtotal + zone.deliveryFee).toFixed(2));
  return {
    ok: true,
    supported: true,
    lines: priced.lines,
    subtotal: priced.subtotal,
    deliveryFee: zone.deliveryFee,
    totalAmount,
    currency: priced.currency,
    zone,
    requireHumanApproval: settings.requireHumanApproval !== false,
    message:
      "Preview only — no order was created. Ask the customer to explicitly confirm before create_sales_order with customerConfirmed=true.",
  };
}

export async function createSalesOrderFromConfirmedConversation(
  ports: SalesOrderToolPorts,
  input: CreateSalesOrderFromConversationInput,
): Promise<SalesOrderToolResult> {
  const settings = await ports.loadOrderSettings(input.companyId);
  if (!settings.aiOrderCollectionEnabled) {
    return {
      ok: false,
      reason: "AI order collection is disabled for this company. Do not collect or create orders.",
      code: "ai_order_collection_disabled",
    };
  }

  if (input.customerConfirmed !== true) {
    return {
      ok: false,
      reason: "Explicit customer confirmation is required (customerConfirmed=true).",
      code: "confirmation_required",
    };
  }

  const items = input.items;
  if (!items.length) {
    return { ok: false, reason: "At least one catalog item is required.", code: "invalid_items" };
  }

  const customerName = trim(input.customerName);
  const customerPhone = trim(input.customerPhone);
  const customerEmail = trim(input.customerEmail);
  const preferredLanguage = trim(input.preferredLanguage);
  const governorate = trim(input.governorate);
  const zoneName = trim(input.zoneName);
  const deliveryAddress = trim(input.deliveryAddress);
  const deliveryNotes = trim(input.deliveryNotes);
  const deliveryLocationUrl = trim(input.deliveryLocationUrl);

  const missing = missingRequired(settings, {
    customerName,
    customerPhone,
    governorate,
    zoneName,
    deliveryAddress,
    deliveryNotes,
    requireAddress: true,
  });
  if (missing) {
    return {
      ok: false,
      reason: `Missing required field: ${missing}`,
      code: "missing_required_field",
    };
  }

  const zone = await ports.findEnabledDeliveryZone({
    companyId: input.companyId,
    governorate,
    zoneName,
  });
  if (!zone) {
    return {
      ok: false,
      reason: "Delivery is not available for this governorate/area.",
      code: "zone_unsupported",
    };
  }

  const priced = await ports.priceCatalogLines({ companyId: input.companyId, items });
  if (!priced.ok) {
    return { ok: false, reason: priced.reason, code: "pricing_failed" };
  }

  const attribution = await ports.loadConversationAttribution({
    companyId: input.companyId,
    conversationId: input.conversationId,
    aiAssistantIdHint: input.aiAssistantIdHint,
  });

  const customer = await ports.upsertCustomerByPhone({
    companyId: input.companyId,
    userId: input.userId ?? attribution.assignedSalespersonId,
    conversationId: input.conversationId,
    name: customerName,
    phone: customerPhone,
    email: customerEmail || null,
    preferredLanguage: preferredLanguage || null,
  });

  const requireHumanApproval = settings.requireHumanApproval !== false;
  const status = requireHumanApproval ? "pending_approval" : "confirmed";
  const confirmationFingerprint = buildFingerprint({
    conversationId: input.conversationId,
    customerPhone,
    governorate,
    zoneName,
    deliveryAddress,
    items,
  });
  const orderNumber = await ports.nextOrderNumber(input.companyId);
  const totalAmount = Number((priced.subtotal + zone.deliveryFee).toFixed(2));

  let written: CreateSalesOrderWriteResult;
  try {
    written = await ports.createSalesOrder({
      companyId: input.companyId,
      actorUserId: input.userId,
      conversationId: input.conversationId,
      orderNumber,
      status,
      requireHumanApproval,
      customerId: customer.customerId,
      customerName,
      customerPhone,
      customerEmail,
      preferredLanguage,
      deliveryZoneId: zone.id,
      deliveryGovernorate: zone.governorate,
      deliveryCityArea: zone.zoneName,
      deliveryAddress,
      deliveryNotes,
      deliveryLat:
        typeof input.deliveryLat === "number" && Number.isFinite(input.deliveryLat)
          ? input.deliveryLat
          : null,
      deliveryLng:
        typeof input.deliveryLng === "number" && Number.isFinite(input.deliveryLng)
          ? input.deliveryLng
          : null,
      deliveryLocationUrl,
      deliveryFee: zone.deliveryFee,
      subtotal: priced.subtotal,
      totalAmount,
      currency: priced.currency,
      sourceChannel: attribution.sourceChannel,
      paymentStatus: "unpaid",
      // AI and human remain separate — never assign salesperson = AI.
      aiEmployeeId: attribution.aiEmployeeId,
      assignedSalespersonId: attribution.assignedSalespersonId,
      createdByAi: true,
      confirmationFingerprint,
      items: priced.lines,
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Failed to create sales order.",
      code: "write_failed",
    };
  }

  if (attribution.leadId && ports.cancelFollowUpAfterPurchase) {
    try {
      await ports.cancelFollowUpAfterPurchase({
        companyId: input.companyId,
        leadId: attribution.leadId,
      });
    } catch {
      // Follow-up cancel is best-effort; order already exists.
    }
  }

  return {
    ok: true,
    orderId: written.orderId,
    orderNumber: written.orderNumber,
    status: written.status,
    requireHumanApproval,
    customerId: written.customerId,
    alreadyExisted: written.alreadyExisted,
    paymentStatus: "unpaid",
    totalAmount,
    currency: priced.currency,
    message: written.alreadyExisted
      ? "An identical confirmed order already exists for this conversation fingerprint. Do not claim paid or delivered."
      : requireHumanApproval
        ? "Order created as pending_approval. A teammate must approve. Payment is unpaid COD. Never claim paid or delivered."
        : "Order created as confirmed. Payment is unpaid COD. Never claim paid or delivered.",
  };
}
