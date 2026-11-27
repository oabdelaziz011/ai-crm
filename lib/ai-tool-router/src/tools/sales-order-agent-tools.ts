import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { SalesOrderToolPorts } from "./sales-order-ports.js";
import {
  CREATE_SALES_ORDER_TOOL_KEY,
  PREVIEW_SALES_ORDER_TOOL_KEY,
  SALES_ORDER_MAX_LINE_QUANTITY,
  SALES_ORDER_MAX_LINES,
  VALIDATE_DELIVERY_ZONE_TOOL_KEY,
} from "./sales-order-tool-definitions.js";
import {
  createSalesOrderFromConfirmedConversation,
  normalizeSalesOrderItems,
  previewSalesOrderFromConversation,
  validateDeliveryZoneForOrder,
} from "./create-sales-order-from-conversation.js";
import { ToolInputValidationError } from "../errors.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

const ORDER_INSTRUCTION =
  "If success is false, do not invent an order number, fee, or ETA. " +
  "If success is true, never claim the order is paid, shipped, or delivered. " +
  "pending_approval means a human teammate must still approve.";

function requireCompany(context: ToolExecutionContext): string {
  const companyId = context.companyId?.trim();
  if (!companyId) throw new Error("Trusted company context is required for sales order tools.");
  return companyId;
}

function requireConversation(context: ToolExecutionContext): string {
  const conversationId = context.conversationId?.trim();
  if (!conversationId) throw new Error("Conversation context is required for sales order tools.");
  return conversationId;
}

function validateItemsShape(input: Record<string, unknown>): void {
  const items = normalizeSalesOrderItems(input.items);
  if (!items) {
    throw new ToolInputValidationError(
      `items must be an array of 1-${SALES_ORDER_MAX_LINES} {productId, quantity} with quantity 1-${SALES_ORDER_MAX_LINE_QUANTITY}.`,
    );
  }
}

function createValidateDeliveryZoneTool(ports: SalesOrderToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            governorate: { type: "string" },
            zoneName: { type: "string" },
          },
          required: ["governorate", "zoneName"],
        },
        input,
      );
    },
    async execute(context, input) {
      const result = await validateDeliveryZoneForOrder(ports, {
        companyId: requireCompany(context),
        governorate: String(input.governorate ?? ""),
        zoneName: String(input.zoneName ?? ""),
      });
      if (!result.ok) {
        return {
          success: false,
          supported: false,
          code: result.code,
          reason: result.reason,
          instruction: ORDER_INSTRUCTION,
        };
      }
      return {
        success: true,
        supported: true,
        zoneId: result.zone.id,
        governorate: result.zone.governorate,
        zoneName: result.zone.zoneName,
        deliveryFee: result.zone.deliveryFee,
        etaMin: result.zone.etaMin,
        etaMax: result.zone.etaMax,
        etaUnit: result.zone.etaUnit,
        message: result.message,
        instruction: ORDER_INSTRUCTION,
      };
    },
  };
}

function createPreviewSalesOrderTool(ports: SalesOrderToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            items: { type: "array" },
            governorate: { type: "string" },
            zoneName: { type: "string" },
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            deliveryAddress: { type: "string" },
          },
          required: ["items", "governorate", "zoneName", "customerName", "customerPhone"],
        },
        input,
      );
      validateItemsShape(input);
    },
    async execute(context, input) {
      const items = normalizeSalesOrderItems(input.items)!;
      const result = await previewSalesOrderFromConversation(ports, {
        companyId: requireCompany(context),
        conversationId: requireConversation(context),
        userId: context.userId,
        aiAssistantIdHint: context.aiAssistantId,
        items,
        customerName: String(input.customerName ?? ""),
        customerPhone: String(input.customerPhone ?? ""),
        governorate: String(input.governorate ?? ""),
        zoneName: String(input.zoneName ?? ""),
        deliveryAddress: typeof input.deliveryAddress === "string" ? input.deliveryAddress : "",
      });
      if (!result.ok) {
        return {
          success: false,
          code: result.code,
          reason: result.reason,
          instruction: ORDER_INSTRUCTION,
        };
      }
      return {
        success: true,
        previewOnly: true,
        subtotal: result.subtotal,
        deliveryFee: result.deliveryFee,
        totalAmount: result.totalAmount,
        currency: result.currency,
        requireHumanApproval: result.requireHumanApproval,
        zoneId: result.zone.id,
        etaMin: result.zone.etaMin,
        etaMax: result.zone.etaMax,
        etaUnit: result.zone.etaUnit,
        lines: result.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
        message: result.message,
        instruction: ORDER_INSTRUCTION,
      };
    },
  };
}

function createCreateSalesOrderTool(ports: SalesOrderToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            customerConfirmed: { type: "boolean" },
            items: { type: "array" },
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            customerEmail: { type: "string" },
            preferredLanguage: { type: "string" },
            governorate: { type: "string" },
            zoneName: { type: "string" },
            deliveryAddress: { type: "string" },
            deliveryNotes: { type: "string" },
            deliveryLocationUrl: { type: "string" },
            deliveryLat: { type: "number" },
            deliveryLng: { type: "number" },
          },
          required: [
            "customerConfirmed",
            "items",
            "customerName",
            "customerPhone",
            "governorate",
            "zoneName",
            "deliveryAddress",
          ],
        },
        input,
      );
      if (input.customerConfirmed !== true && input.customerConfirmed !== false) {
        throw new ToolInputValidationError("customerConfirmed must be a boolean.");
      }
      validateItemsShape(input);
    },
    async execute(context, input) {
      const items = normalizeSalesOrderItems(input.items)!;
      const result = await createSalesOrderFromConfirmedConversation(ports, {
        companyId: requireCompany(context),
        conversationId: requireConversation(context),
        userId: context.userId,
        aiAssistantIdHint: context.aiAssistantId,
        customerConfirmed: input.customerConfirmed === true,
        items,
        customerName: String(input.customerName ?? ""),
        customerPhone: String(input.customerPhone ?? ""),
        customerEmail: typeof input.customerEmail === "string" ? input.customerEmail : "",
        preferredLanguage:
          typeof input.preferredLanguage === "string" ? input.preferredLanguage : "",
        governorate: String(input.governorate ?? ""),
        zoneName: String(input.zoneName ?? ""),
        deliveryAddress: String(input.deliveryAddress ?? ""),
        deliveryNotes: typeof input.deliveryNotes === "string" ? input.deliveryNotes : "",
        deliveryLocationUrl:
          typeof input.deliveryLocationUrl === "string" ? input.deliveryLocationUrl : "",
        deliveryLat: typeof input.deliveryLat === "number" ? input.deliveryLat : null,
        deliveryLng: typeof input.deliveryLng === "number" ? input.deliveryLng : null,
      });

      if (!result.ok) {
        return {
          success: false,
          code: result.code,
          reason: result.reason,
          instruction: ORDER_INSTRUCTION,
        };
      }

      return {
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        status: result.status,
        requireHumanApproval: result.requireHumanApproval,
        customerId: result.customerId,
        alreadyExisted: result.alreadyExisted,
        paymentStatus: result.paymentStatus,
        totalAmount: result.totalAmount,
        currency: result.currency,
        message: result.message,
        instruction: ORDER_INSTRUCTION,
      };
    },
  };
}

export function createSalesOrderAgentTools(ports: SalesOrderToolPorts): Record<string, Tool> {
  return {
    [VALIDATE_DELIVERY_ZONE_TOOL_KEY]: createValidateDeliveryZoneTool(ports),
    [PREVIEW_SALES_ORDER_TOOL_KEY]: createPreviewSalesOrderTool(ports),
    [CREATE_SALES_ORDER_TOOL_KEY]: createCreateSalesOrderTool(ports),
  };
}
