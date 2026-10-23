import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { QuoteAgentToolPorts } from "./quote-agent-ports.js";
import {
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  GET_QUOTE_DELIVERY_STATUS_TOOL_KEY,
  QUOTE_DRAFT_MAX_QUANTITY,
  REQUEST_SEND_QUOTE_TOOL_KEY,
} from "./quote-tool-definitions.js";
import { resolveAiQuoteSendPolicy } from "./quote-send-policy.js";
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

const DRAFT_ONLY_INSTRUCTION =
  "If success is true, tell the customer only that an internal quote draft was prepared for the team to review. " +
  "Never claim the quote was sent, approved, paid, or ordered. If success is false, do not invent a quote number.";

const SEND_REQUEST_INSTRUCTION =
  "If success is true, tell the customer only that a teammate must approve before the quote can be sent. " +
  "Never claim the quote was sent. deliveryState pending_human_approval means NOT sent. " +
  "Only say sent when get_quote_delivery_status (or this tool) returns sent:true from real delivery records.";

const STATUS_INSTRUCTION =
  "Report deliveryState accurately. sent:true only when the platform recorded a real send. " +
  "draft, pending_human_approval, sending, and failed all mean the customer has not received a delivered quote claim.";

function requireCompany(context: ToolExecutionContext): string {
  const companyId = context.companyId?.trim();
  if (!companyId) throw new Error("Trusted company context is required for quote tools.");
  return companyId;
}

function requireUser(context: ToolExecutionContext): string {
  const userId = context.userId?.trim();
  if (!userId) throw new Error("An authenticated user is required for quote tools.");
  return userId;
}

function requireConversation(context: ToolExecutionContext): string {
  const conversationId = context.conversationId?.trim();
  if (!conversationId) throw new Error("Conversation context is required for quote tools.");
  return conversationId;
}

function createCreateDraftQuoteTool(ports: QuoteAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            title: { type: "string" },
            quantity: { type: "number" },
            productId: { type: "string" },
          },
        },
        input,
      );
      if (input.quantity != null) {
        if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity)) {
          throw new ToolInputValidationError("quantity must be a finite number.");
        }
        if (input.quantity < 1 || input.quantity > QUOTE_DRAFT_MAX_QUANTITY) {
          throw new ToolInputValidationError(
            `quantity must be between 1 and ${QUOTE_DRAFT_MAX_QUANTITY}.`,
          );
        }
      }
    },
    async execute(context, input) {
      const result = await ports.createDraftQuoteFromVerifiedInterest({
        companyId: requireCompany(context),
        userId: requireUser(context),
        conversationId: requireConversation(context),
        title: typeof input.title === "string" ? input.title : undefined,
        quantity: typeof input.quantity === "number" ? input.quantity : undefined,
        productId: typeof input.productId === "string" ? input.productId : undefined,
      });

      if (result.ok) {
        const pricesVisible =
          typeof ports.showProductPrices === "function" ? ports.showProductPrices() === true : true;
        return {
          success: true,
          created: result.created,
          alreadyExists: result.alreadyExists,
          draftOnly: true,
          status: "draft",
          deliveryState: "draft",
          quoteId: result.quoteId,
          quoteNumber: result.quoteNumber,
          opportunityId: result.opportunityId,
          leadId: result.leadId,
          productId: result.productId,
          productName: result.productName,
          quantity: result.quantity,
          currency: result.currency,
          ...(pricesVisible
            ? {
                grandTotal: result.grandTotal,
                unitPrice: result.unitPrice,
                priceSource: result.priceSource,
                priceSourceNote: result.priceSourceNote,
              }
            : {
                pricesVisible: false,
                priceSource: result.priceSource,
                priceSourceNote:
                  "Prices are hidden by company settings. Do not invent or disclose unit or total prices to the customer.",
              }),
          message: result.message,
          instruction: pricesVisible
            ? DRAFT_ONLY_INSTRUCTION
            : `${DRAFT_ONLY_INSTRUCTION} Do not disclose unitPrice or totals; prices are not listed for this employee.`,
          sent: false,
          approved: false,
          orderCreated: false,
          paymentCreated: false,
        };
      }

      return {
        success: false,
        draftOnly: true,
        status: result.status,
        deliveryState: "draft",
        ...(result.status === "needs_data"
          ? { missing: result.missing, askCustomer: result.askCustomer }
          : {}),
        ...(result.status === "denied" || result.status === "failed"
          ? { errorCode: result.errorCode }
          : {}),
        message: result.message,
        instruction: DRAFT_ONLY_INSTRUCTION,
        sent: false,
        approved: false,
        orderCreated: false,
        paymentCreated: false,
      };
    },
  };
}

function createRequestSendQuoteTool(ports: QuoteAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            quoteId: { type: "string" },
            channel: { type: "string", enum: ["email", "whatsapp"] },
          },
        },
        input,
      );
      if (input.channel != null && input.channel !== "email" && input.channel !== "whatsapp") {
        throw new ToolInputValidationError("channel must be email or whatsapp.");
      }
    },
    async execute(context, input) {
      const companyId = requireCompany(context);
      const userId = requireUser(context);
      const conversationId = requireConversation(context);
      const channel =
        input.channel === "whatsapp" || input.channel === "email" ? input.channel : undefined;
      const persistedMode = ports.readPersistedQuoteSendPolicy
        ? await ports.readPersistedQuoteSendPolicy({ companyId })
        : null;
      const policy = resolveAiQuoteSendPolicy({
        persistedMode,
        serverAuthorizedQuoteSend: ports.serverAuthorizedQuoteSend?.({ companyId }) === true,
      });

      if (policy.mode === "direct_send") {
        if (!ports.sendAuthorizedQuote) {
          return {
            success: false,
            deliveryState: "draft",
            sent: false,
            approved: false,
            policyReason: "direct_send_port_missing",
            message: "Direct quote sending is not wired. A human must approve.",
            instruction: SEND_REQUEST_INSTRUCTION,
          };
        }
        const sent = await ports.sendAuthorizedQuote({
          companyId,
          userId,
          conversationId,
          quoteId: typeof input.quoteId === "string" ? input.quoteId : undefined,
          channel,
        });
        return {
          success: sent.ok,
          deliveryState: sent.ok ? sent.deliveryState : sent.deliveryState,
          sent: sent.ok ? sent.sent : sent.sent,
          approved: false,
          policyReason: policy.reason,
          message: sent.message,
          instruction: SEND_REQUEST_INSTRUCTION,
          ...(sent.ok ? { quoteId: sent.quoteId, quoteNumber: sent.quoteNumber } : { errorCode: sent.errorCode }),
        };
      }

      const result = await ports.requestSendQuote({
        companyId,
        userId,
        conversationId,
        quoteId: typeof input.quoteId === "string" ? input.quoteId : undefined,
        channel,
      });

      if (result.ok) {
        return {
          success: true,
          alreadyPending: result.alreadyPending,
          quoteId: result.quoteId,
          quoteNumber: result.quoteNumber,
          quoteStatus: result.quoteStatus,
          deliveryState: result.deliveryState,
          channel: result.channel,
          requiresHumanApproval: true,
          policyReason: policy.reason,
          message: result.message,
          instruction: SEND_REQUEST_INSTRUCTION,
          sent: false,
          approved: false,
        };
      }

      return {
        success: false,
        status: result.status,
        deliveryState: result.deliveryState,
        errorCode: result.errorCode,
        message: result.message,
        instruction: SEND_REQUEST_INSTRUCTION,
        sent: result.sent,
        approved: false,
        policyReason: policy.reason,
      };
    },
  };
}

function createGetQuoteDeliveryStatusTool(ports: QuoteAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            quoteId: { type: "string" },
          },
        },
        input,
      );
    },
    async execute(context, input) {
      const result = await ports.getQuoteDeliveryStatus({
        companyId: requireCompany(context),
        conversationId: requireConversation(context),
        quoteId: typeof input.quoteId === "string" ? input.quoteId : undefined,
      });

      return {
        success: result.ok,
        quoteId: result.quoteId,
        quoteNumber: result.quoteNumber,
        quoteStatus: result.quoteStatus,
        deliveryState: result.deliveryState,
        attemptStatus: result.attemptStatus,
        sendRequestStatus: result.sendRequestStatus,
        channel: result.channel,
        errorCode: result.errorCode,
        message: result.message,
        instruction: STATUS_INSTRUCTION,
        sent: result.sent,
        approved: false,
      };
    },
  };
}

export function createQuoteAgentTools(ports: QuoteAgentToolPorts): Record<string, Tool> {
  return {
    [CREATE_DRAFT_QUOTE_TOOL_KEY]: createCreateDraftQuoteTool(ports),
    [REQUEST_SEND_QUOTE_TOOL_KEY]: createRequestSendQuoteTool(ports),
    [GET_QUOTE_DELIVERY_STATUS_TOOL_KEY]: createGetQuoteDeliveryStatusTool(ports),
  };
}
