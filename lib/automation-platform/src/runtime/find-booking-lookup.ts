import { resolveFieldBindingAsString } from "../field-binding/resolver.js";
import { normalizeFindBookingConfig } from "../crm/find-booking-config.js";
import type { BookingLookupField } from "../crm/lookup/booking-types.js";
import type { ExecutionContext } from "../engine/execution-context.js";

export type ResolvedFindBookingLookup = {
  lookupBy: BookingLookupField;
  lookupValue: string;
};

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readDigits(value: unknown): string {
  return readTrimmedString(value).replace(/\D/g, "");
}

function readCustomerRecord(scope: Record<string, unknown>): Record<string, unknown> | null {
  const customer = scope.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  return customer as Record<string, unknown>;
}

function firstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    const trimmed = readTrimmedString(value);
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Instagram senders are numeric IGSID, not a phone. Only WhatsApp `from` is a phone.
 */
export function readWhatsAppSenderPhone(input: {
  channel?: string | null;
  externalUserId?: string | null;
  variables?: Record<string, unknown>;
}): string {
  const fromVariables = firstNonEmpty([
    input.variables?.whatsapp_sender_phone,
    input.variables?.sender_phone,
  ]);
  if (fromVariables) return fromVariables;

  const channel = readTrimmedString(input.channel).toLowerCase();
  if (channel !== "whatsapp") return "";
  return readDigits(input.externalUserId);
}

export function resolveFindBookingLookup(
  context: ExecutionContext,
  config: Record<string, unknown>,
  scope: Record<string, unknown>,
): ResolvedFindBookingLookup {
  const normalized = normalizeFindBookingConfig(config);
  let lookupBy = normalized.lookupBy;
  let lookupValue = resolveFieldBindingAsString(normalized.value, scope);

  const customer = readCustomerRecord(scope);
  const customerPhone = firstNonEmpty([
    scope.customer_phone,
    scope.phone,
    customer?.phone,
    customer?.phone_e164,
    customer?.phoneE164,
    scope["customer.phone"],
    scope["customer.phone_e164"],
  ]);
  const customerId = firstNonEmpty([
    context.customer.id,
    customer?.id,
    scope["customer.id"],
  ]);
  const senderPhone = readWhatsAppSenderPhone({
    channel: context.session.channel,
    externalUserId: context.session.external_user_id,
    variables: scope,
  });

  if (!lookupValue) {
    lookupValue = firstNonEmpty([senderPhone, customerPhone]);
  }

  if (!lookupValue && customerId) {
    lookupBy = "customer_id";
    lookupValue = customerId;
  }

  return { lookupBy, lookupValue };
}
