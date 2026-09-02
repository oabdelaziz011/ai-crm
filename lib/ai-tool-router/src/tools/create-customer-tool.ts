import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { ToolCustomerServicePort } from "./customer-service-port.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";
import {
  buildExistingCustomerGreetingAr,
  buildNewCustomerGreetingAr,
} from "../utils/scheduling-customer-display.js";
import {
  buildWhatsAppSenderPhoneLookupVariants,
  customerPhoneMatchesWhatsAppSender,
  resolveWhatsAppSenderPhoneE164,
} from "../utils/resolve-trusted-channel-customer.js";
import {
  buildCustomerPhoneIdentityColumns,
  type CustomerPhoneIdentityColumns,
} from "../utils/customer-phone-identity-dual-write.js";
import { resolvePhoneIdentity } from "../utils/phone-identity-resolver.js";

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    phone: { type: "string", minLength: 7 },
    /** Optional ISO-2 when phone is a local/national number. Never company country. */
    region: { type: "string", minLength: 2, maxLength: 2 },
    email: { type: "string" },
  },
  required: ["name", "phone"],
} as const;

const INCOMPLETE_FULL_NAME_MESSAGE_AR =
  "محتاجين الاسم الكامل للعميل (مش الاسم الأول فقط). ممكن تقوليلي الاسم بالكامل؟";

const PHONE_SENDER_MISMATCH_MESSAGE_AR =
  "رقم الموبايل لازم يكون نفس رقم واتساب اللي بيتكلم منه العميل دلوقتي.";

const PHONE_REGION_REQUIRED_MESSAGE_AR =
  "محتاجين رقم الموبايل بالصيغة الدولية (مثال +966...) أو تحديد الدولة صراحة.";

const PHONE_INVALID_MESSAGE_AR = "رقم الموبايل غير صالح. ممكن تبعت الرقم بالصيغة الدولية؟";

function isCompleteCustomerFullName(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((token) => /[\u0600-\u06FFa-zA-Z]{2,}/.test(token));
}

const SUPPORTED_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function readOptionalRegion(value: unknown): string | null {
  if (value == null) return null;
  const region = typeof value === "string" ? value.trim().toUpperCase() : String(value).trim().toUpperCase();
  if (!region) return null;
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error("Phone region must be a 2-letter ISO country code when provided.");
  }
  return region;
}

/**
 * D5.1 — global create_customer phone identity.
 * Never assumes EG. Local nationals require explicit region or WhatsApp channel sender.
 */
function resolveCreateCustomerPhone(input: {
  phone: string;
  region?: string | null;
  channelSender?: string | null;
}): { phoneForStorage: string; phoneIdentity: CustomerPhoneIdentityColumns } {
  const phone = input.phone.trim();
  const region = input.region?.trim() ? input.region.trim().toUpperCase() : null;
  const channelSender = input.channelSender?.trim() || null;

  if (channelSender) {
    if (!customerPhoneMatchesWhatsAppSender(phone, channelSender)) {
      throw new Error(PHONE_SENDER_MISMATCH_MESSAGE_AR);
    }
    const senderE164 = resolveWhatsAppSenderPhoneE164(channelSender);
    if (!senderE164) {
      throw new Error(PHONE_INVALID_MESSAGE_AR);
    }
    // Resolve from Meta sender digits (source=channel) — never invent EG / company country.
    const phoneIdentity = buildCustomerPhoneIdentityColumns({
      phone: channelSender,
      source: "channel",
    });
    if (!phoneIdentity.phone_e164 || phoneIdentity.phone_e164 !== senderE164) {
      throw new Error(PHONE_INVALID_MESSAGE_AR);
    }
    return { phoneForStorage: phone, phoneIdentity };
  }

  const resolved = resolvePhoneIdentity({
    phone,
    region,
    source: "explicit",
  });
  if (resolved.status !== "resolved") {
    if (resolved.reason === "missing_region") {
      throw new Error(PHONE_REGION_REQUIRED_MESSAGE_AR);
    }
    throw new Error(PHONE_INVALID_MESSAGE_AR);
  }

  const phoneIdentity = buildCustomerPhoneIdentityColumns({
    phone,
    region,
    source: "explicit",
  });
  if (!phoneIdentity.phone_e164) {
    throw new Error(PHONE_INVALID_MESSAGE_AR);
  }
  return { phoneForStorage: phone, phoneIdentity };
}

function normalizeEmail(value: unknown): string | null {
  if (value == null) return null;
  const email = typeof value === "string" ? value.trim() : String(value).trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email format is invalid.");
  }
  return email.toLowerCase();
}

async function findCustomerByPhoneVariants(
  customerService: ToolCustomerServicePort,
  context: ToolExecutionContext,
  phone: string,
  phoneE164Hint?: string | null,
) {
  // Prefer company-scoped phone_e164 before legacy phone variants. Never invent EG.
  const phoneE164 =
    phoneE164Hint?.trim() ||
    resolveWhatsAppSenderPhoneE164(phone) ||
    buildCustomerPhoneIdentityColumns({ phone, source: "explicit" }).phone_e164;
  if (phoneE164) {
    const e164Result = await customerService.findCustomer({
      companyId: context.companyId,
      userId: context.userId!,
      lookupBy: "phone_e164",
      lookupValue: phoneE164,
    });
    if (e164Result.status === "found" && e164Result.customer) {
      return e164Result;
    }
    if (e164Result.status === "duplicate") {
      return { status: "duplicate" as const, count: e164Result.count };
    }
  }

  const variants = buildWhatsAppSenderPhoneLookupVariants(phone);
  let duplicate = false;
  for (const variant of variants) {
    const result = await customerService.findCustomer({
      companyId: context.companyId,
      userId: context.userId!,
      lookupBy: "phone",
      lookupValue: variant,
    });
    if (result.status === "found" && result.customer) {
      return result;
    }
    if (result.status === "duplicate") {
      duplicate = true;
    }
  }
  if (duplicate) {
    return { status: "duplicate" as const, count: 2 };
  }
  return { status: "not_found" as const, count: 0 as const };
}

async function linkAndStampTrusted(
  customerService: ToolCustomerServicePort,
  conversationId: string,
  customerId: string,
  customerName: string,
) {
  await customerService.linkConversationCustomer?.({
    conversationId,
    customerId,
    customerName,
    stampTrustedIdentity: true,
  });
}

export function createCreateCustomerTool(customerService: ToolCustomerServicePort): Tool {
  return {
    supports(state: ConversationState) {
      return SUPPORTED_STATES.includes(state);
    },
    validate(input: Record<string, unknown>) {
      validateAgainstSchema(INPUT_SCHEMA, input);
      resolveCreateCustomerPhone({
        phone: readRequiredString(input.phone, "Phone"),
        region: readOptionalRegion(input.region),
      });
      normalizeEmail(input.email);
    },
    async execute(context: ToolExecutionContext, input: Record<string, unknown>) {
      const name = readRequiredString(input.name, "Name");
      if (!isCompleteCustomerFullName(name)) {
        return {
          success: false,
          errorCode: "INCOMPLETE_FULL_NAME",
          message: "Customer full name is required (first + family name).",
          customerFacingMessage: INCOMPLETE_FULL_NAME_MESSAGE_AR,
        };
      }
      const email = normalizeEmail(input.email);
      const region = readOptionalRegion(input.region);

      if (!context.userId) {
        return {
          success: false,
          errorCode: "AUTH_REQUIRED",
          message: "An authenticated user is required to create customers.",
        };
      }

      // WhatsApp: identity from Meta sender E.164; CRM phone must match sender.
      const channelSender = await customerService.getConversationWhatsAppSender?.({
        conversationId: context.conversationId,
      });

      let phone: string;
      let phoneIdentity: CustomerPhoneIdentityColumns;
      try {
        const resolved = resolveCreateCustomerPhone({
          phone: readRequiredString(input.phone, "Phone"),
          region,
          channelSender: channelSender ?? null,
        });
        phone = resolved.phoneForStorage;
        phoneIdentity = resolved.phoneIdentity;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === PHONE_SENDER_MISMATCH_MESSAGE_AR) {
          return {
            success: false,
            errorCode: "PHONE_SENDER_MISMATCH",
            message: "Customer phone must match the WhatsApp sender for this conversation.",
            customerFacingMessage: PHONE_SENDER_MISMATCH_MESSAGE_AR,
          };
        }
        if (message === PHONE_REGION_REQUIRED_MESSAGE_AR) {
          return {
            success: false,
            errorCode: "PHONE_REGION_REQUIRED",
            message: "Phone requires E.164 or an explicit ISO-2 region.",
            customerFacingMessage: PHONE_REGION_REQUIRED_MESSAGE_AR,
          };
        }
        return {
          success: false,
          errorCode: "INVALID_PHONE",
          message: "Phone identity could not be resolved.",
          customerFacingMessage: PHONE_INVALID_MESSAGE_AR,
        };
      }

      const duplicateCheck = await findCustomerByPhoneVariants(
        customerService,
        context,
        phone,
        phoneIdentity.phone_e164,
      );

      if (duplicateCheck.status === "found" && duplicateCheck.customer) {
        const customer = duplicateCheck.customer;
        await linkAndStampTrusted(
          customerService,
          context.conversationId,
          customer.id,
          customer.name,
        );
        return {
          success: true,
          customerId: customer.id,
          existing: true,
          customerName: customer.name,
          customerGreeting: buildExistingCustomerGreetingAr(customer.name),
          message: "Customer already exists. Use this customerId for create_booking.",
        };
      }

      if (duplicateCheck.status === "duplicate") {
        return {
          success: false,
          errorCode: "DUPLICATE_CUSTOMER",
          message: `Multiple customers match phone ${phone}. Please clarify with the user.`,
        };
      }

      if (email) {
        const emailCheck = await customerService.findCustomer({
          companyId: context.companyId,
          userId: context.userId,
          lookupBy: "email",
          lookupValue: email,
        });
        if (emailCheck.status === "found" && emailCheck.customer) {
          return {
            success: false,
            errorCode: "DUPLICATE_CUSTOMER",
            customerId: emailCheck.customer.id,
            message: `A customer with email ${email} already exists.`,
          };
        }
      }

      try {
        const created = await customerService.createCustomer({
          companyId: context.companyId,
          userId: context.userId,
          name,
          phone,
          email,
          phoneIdentity,
        });

        await linkAndStampTrusted(
          customerService,
          context.conversationId,
          created.customer.id,
          created.customer.name,
        );

        return {
          success: true,
          customerId: created.customer.id,
          customerName: created.customer.name,
          customerGreeting: buildNewCustomerGreetingAr(name),
          message: "Customer created successfully",
        };
      } catch (error) {
        // Concurrency: UNIQUE(company_id, phone_e164) — loser re-resolves existing customer.
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "";
        if (/phone_e164|company_phone_e164/i.test(message) || /unique constraint/i.test(message)) {
          const raced = await findCustomerByPhoneVariants(
            customerService,
            context,
            phone,
            phoneIdentity.phone_e164,
          );
          if (raced.status === "found" && raced.customer) {
            await linkAndStampTrusted(
              customerService,
              context.conversationId,
              raced.customer.id,
              raced.customer.name,
            );
            return {
              success: true,
              customerId: raced.customer.id,
              existing: true,
              customerName: raced.customer.name,
              customerGreeting: buildExistingCustomerGreetingAr(raced.customer.name),
              message: "Customer already exists. Use this customerId for create_booking.",
            };
          }
        }
        throw error;
      }
    },
  };
}

export const CREATE_CUSTOMER_TOOL_KEY = "create_customer" as const;

export const CREATE_CUSTOMER_LLM_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: CREATE_CUSTOMER_TOOL_KEY,
    description:
      "Create or resolve a customer in the CRM for booking. Requires customer name and phone (E.164 preferred, or local national with optional ISO-2 region). Never invents country from company locale. If the phone already exists, returns that customerId and preserves the existing CRM name. On WhatsApp, phone must match the current sender; identity uses the Meta sender E.164.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full customer name" },
        phone: {
          type: "string",
          description:
            "Customer phone. Prefer E.164 (+966…). Local nationals require region (ISO-2) unless WhatsApp sender identity is available.",
        },
        region: {
          type: "string",
          description: "Optional ISO-3166-1 alpha-2 region for local/national numbers. Never company country.",
        },
        email: { type: "string", description: "Optional customer email" },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
};
