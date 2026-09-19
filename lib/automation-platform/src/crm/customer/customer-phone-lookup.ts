import {
  buildWhatsAppSenderPhoneLookupVariants,
  planCustomerPhoneSearch,
  resolvePhoneIdentity,
  validateEgyptMobilePhone,
} from "@workspace/ai-tool-router";
import type { CustomerLookupField } from "../lookup/types.js";

export type CustomerPhoneLookupAttempt = {
  lookupBy: CustomerLookupField;
  lookupValue: string;
};

function pushAttempt(
  attempts: CustomerPhoneLookupAttempt[],
  seen: Set<string>,
  lookupBy: "phone" | "phone_e164",
  lookupValue: string,
): void {
  const value = lookupValue.trim();
  if (!value) return;
  const key = `${lookupBy}:${value}`;
  if (seen.has(key)) return;
  seen.add(key);
  attempts.push({ lookupBy, lookupValue: value });
}

function resolveCanonicalPhoneE164(value: string): string | null {
  const plan = planCustomerPhoneSearch({ query: value, source: "explicit" });
  if (plan.strategy === "phone_e164" && plan.phoneE164?.trim()) {
    return plan.phoneE164.trim();
  }

  const channel = resolvePhoneIdentity({ phone: value, source: "channel" });
  if (channel.status === "resolved" && channel.phoneE164.trim()) {
    return channel.phoneE164.trim();
  }

  return null;
}

/**
 * Company-scoped findCustomer attempts for phone / phone_e164.
 *
 * Reuses existing identity helpers (no second normalizer):
 * 1. Canonical phone_e164 via planCustomerPhoneSearch / resolvePhoneIdentity
 * 2. Legacy customers.phone variants via buildWhatsAppSenderPhoneLookupVariants
 *    (Egypt national forms only when validateEgyptMobilePhone accepts the input)
 *
 * Does not use last-9 / bookingPhonesDigitEquivalent.
 */
export function buildCustomerPhoneLookupAttempts(
  lookupBy: CustomerLookupField,
  lookupValue: string,
): CustomerPhoneLookupAttempt[] {
  const value = lookupValue.trim();
  if (!value) return [];
  if (lookupBy !== "phone" && lookupBy !== "phone_e164") {
    return [{ lookupBy, lookupValue: value }];
  }

  const seen = new Set<string>();
  const attempts: CustomerPhoneLookupAttempt[] = [];

  const canonicalE164 = resolveCanonicalPhoneE164(value);
  if (canonicalE164) {
    pushAttempt(attempts, seen, "phone_e164", canonicalE164);
  }

  const phoneVariants = new Set<string>([value]);
  for (const variant of buildWhatsAppSenderPhoneLookupVariants(value)) {
    phoneVariants.add(variant);
  }
  if (canonicalE164) {
    phoneVariants.add(canonicalE164);
    if (canonicalE164.startsWith("+")) {
      phoneVariants.add(canonicalE164.slice(1));
    }
  }

  const egypt = validateEgyptMobilePhone(value);
  if (egypt.valid) {
    phoneVariants.add(egypt.local);
    phoneVariants.add(egypt.normalized);
    phoneVariants.add(`+${egypt.normalized}`);
  }

  for (const variant of phoneVariants) {
    pushAttempt(attempts, seen, "phone", variant);
  }

  if (attempts.length === 0) {
    pushAttempt(attempts, seen, lookupBy === "phone_e164" ? "phone_e164" : "phone", value);
  }

  return attempts;
}
