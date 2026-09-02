import {
  normalizeEgyptMobilePhone,
  validateEgyptMobilePhone,
} from "./customer-phone-normalization.js"; // reuse existing Egypt mobile helpers — do not add a second normalizer
import {
  createCompanyPhoneIdentityLookup,
  resolvePhoneIdentity,
} from "./phone-identity-resolver.js";
import {
  lookupWhatsAppSenderTrustedCustomerOverride,
  resolveTrustedCustomerWelcomeDisplayName,
} from "./whatsapp-trusted-identity-overrides.js";

export type TrustedChannelCustomerMatch = {
  id: string;
  name: string;
  phone: string | null;
  phoneE164?: string | null;
};

export type PhoneLookupResult = {
  status: "found" | "not_found" | "duplicate";
  customer?: TrustedChannelCustomerMatch | null;
  count?: number;
};

export type ResolveTrustedChannelCustomerInput = {
  companyId: string;
  channelKey: string;
  senderExternalId: string | null | undefined;
  /**
   * Company-scoped CRM lookup by exact legacy phone string.
   * Must already filter by companyId — never search globally.
   */
  findByPhone: (phone: string) => Promise<PhoneLookupResult>;
  /**
   * Phase D2 — company-scoped CRM lookup by canonical phone_e164.
   * Must already filter by companyId — never search globally.
   */
  findByPhoneE164?: (phoneE164: string) => Promise<PhoneLookupResult>;
};

export type ResolveTrustedChannelCustomerResult =
  | {
      status: "known";
      customerId: string;
      trustedCustomerName: string;
      matchedPhone: string;
      /** D2: how the match was established. */
      matchSource?: "phone_e164" | "legacy_phone";
    }
  | { status: "unknown" }
  | { status: "ambiguous"; matchCount: number }
  | { status: "unsupported_channel" }
  | { status: "invalid_sender" };

/**
 * Build safe phone lookup variants for WhatsApp Meta `message.from` (e.g. 2010…)
 * against CRM storage that may use local (010…) or E.164 (2010…) forms.
 * Reuses existing Egypt mobile normalization — does not invent a second utility.
 * Primary inbound identity prefers phone_e164 via resolvePhoneIdentity; variants remain
 * the legacy bridge for rows that still have phone_e164 = NULL.
 */
export function buildWhatsAppSenderPhoneLookupVariants(
  senderExternalId: string,
): string[] {
  const validated = validateEgyptMobilePhone(senderExternalId);
  if (!validated.valid) {
    // Still try raw digits + normalizeEgyptMobilePhone for near-matches.
    const digits = normalizeEgyptMobilePhone(senderExternalId);
    if (!digits || digits.length < 10) return [];
    const variants = new Set<string>([digits]);
    if (digits.startsWith("20") && digits.length >= 12) {
      variants.add(`0${digits.slice(2)}`);
      variants.add(`+${digits}`);
    }
    return [...variants];
  }

  const variants = new Set<string>([validated.normalized, validated.local]);
  // Also include bare national without leading 0 (rare CRM storage).
  if (validated.local.startsWith("0") && validated.local.length === 11) {
    variants.add(validated.local.slice(1));
  }
  // CRM rows sometimes store E.164 with explicit '+'.
  if (validated.normalized.startsWith("20")) {
    variants.add(`+${validated.normalized}`);
  }
  return [...variants];
}

/**
 * Canonical Meta sender → E.164 via global resolver (source=channel).
 * Returns null when unsafe / unresolved (fail closed — no country guess).
 */
export function resolveWhatsAppSenderPhoneE164(
  senderExternalId: string | null | undefined,
): string | null {
  const sender = typeof senderExternalId === "string" ? senderExternalId.trim() : "";
  if (!sender) return null;
  const resolved = resolvePhoneIdentity({ phone: sender, source: "channel" });
  if (resolved.status !== "resolved") return null;
  return resolved.phoneE164;
}

/**
 * True when a CRM phone string is one of the WhatsApp sender lookup variants.
 * Used to decide whether an existing conversation.customer_id is consistent with the sender.
 * Also matches when customer.phone_e164 equals the sender's canonical E.164.
 */
export function customerPhoneMatchesWhatsAppSender(
  customerPhone: string | null | undefined,
  senderExternalId: string | null | undefined,
  customerPhoneE164?: string | null,
): boolean {
  const phone = typeof customerPhone === "string" ? customerPhone.trim() : "";
  const sender = typeof senderExternalId === "string" ? senderExternalId.trim() : "";
  if (!sender) return false;

  const senderE164 = resolveWhatsAppSenderPhoneE164(sender);
  const crmE164 = typeof customerPhoneE164 === "string" ? customerPhoneE164.trim() : "";
  if (senderE164 && crmE164 && senderE164 === crmE164) return true;

  if (!phone) return false;
  const senderVariants = new Set(buildWhatsAppSenderPhoneLookupVariants(sender));
  if (senderVariants.has(phone)) return true;
  // Also accept CRM phone's own normalized variants overlapping sender variants.
  for (const variant of buildWhatsAppSenderPhoneLookupVariants(phone)) {
    if (senderVariants.has(variant)) return true;
  }
  // CRM may store +E.164 in phone while Meta sends digits without +.
  if (senderE164 && (phone === senderE164 || phone === senderE164.slice(1))) return true;
  return false;
}

/**
 * Prefer stamped WhatsApp channel identity over a possibly-stale conversation.customer_id.
 * When metadata.trustedChannelCustomerId is present (including explicit null), it wins.
 * When absent (dashboard / pre-stamp), fall back to conversation.customer_id.
 */
export function readTrustedCustomerIdFromConversation(input: {
  customerId: string | null | undefined;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = input.metadata ?? {};
  if (Object.prototype.hasOwnProperty.call(meta, "trustedChannelCustomerId")) {
    const stamped = meta.trustedChannelCustomerId;
    if (typeof stamped === "string" && stamped.trim()) return stamped.trim();
    return null;
  }
  const existing = typeof input.customerId === "string" ? input.customerId.trim() : "";
  return existing || null;
}

function toKnownResult(
  only: { customer: TrustedChannelCustomerMatch; matchedPhone: string },
  matchSource: "phone_e164" | "legacy_phone",
): ResolveTrustedChannelCustomerResult {
  const displayName = resolveTrustedCustomerWelcomeDisplayName(
    only.customer.id,
    only.customer.name,
  );
  return {
    status: "known",
    customerId: only.customer.id,
    trustedCustomerName: displayName ?? "",
    matchedPhone: only.matchedPhone,
    matchSource,
  };
}

/**
 * Resolve trusted CRM identity from a channel sender id.
 * WhatsApp only. Fail closed on ambiguity / cross-variant conflicts.
 * Never trusts senderName, LLM customerId, or companyId from payload.
 *
 * Phase D2 lookup order:
 * 1. company_id + canonical phone_e164 (via resolvePhoneIdentity source=channel)
 * 2. legacy Egypt phone-string variants on customers.phone
 */
export async function resolveTrustedChannelCustomer(
  input: ResolveTrustedChannelCustomerInput,
): Promise<ResolveTrustedChannelCustomerResult> {
  const companyId = input.companyId.trim();
  if (!companyId) return { status: "invalid_sender" };

  const channelKey = input.channelKey.trim().toLowerCase();
  if (channelKey !== "whatsapp") {
    return { status: "unsupported_channel" };
  }

  const sender = typeof input.senderExternalId === "string" ? input.senderExternalId.trim() : "";
  if (!sender) return { status: "invalid_sender" };

  // --- D2 primary: company-scoped phone_e164 ---
  const phoneE164 = resolveWhatsAppSenderPhoneE164(sender);
  if (phoneE164 && input.findByPhoneE164) {
    const scoped = createCompanyPhoneIdentityLookup({
      companyId,
      phoneE164,
    });
    if (!scoped.ok) {
      // Should not happen when phoneE164 is valid — fail closed.
      return { status: "invalid_sender" };
    }
    const e164Result = await input.findByPhoneE164(scoped.lookup.phoneE164);
    if (e164Result.status === "duplicate") {
      return { status: "ambiguous", matchCount: e164Result.count ?? 2 };
    }
    if (e164Result.status === "found" && e164Result.customer?.id) {
      return toKnownResult(
        { customer: e164Result.customer, matchedPhone: phoneE164 },
        "phone_e164",
      );
    }
  }

  // --- Legacy bridge: Egypt / phone-string variants ONLY when phone_e164 IS NULL ---
  const variants = buildWhatsAppSenderPhoneLookupVariants(sender);
  // If global resolver produced E.164 but no e164-column hit, also try exact e164/digits
  // against legacy phone column (some rows store +E.164 in phone).
  if (phoneE164) {
    variants.unshift(phoneE164, phoneE164.slice(1));
  }
  const uniqueVariants = [...new Set(variants.filter(Boolean))];
  if (uniqueVariants.length === 0) {
    // International sender that did not resolve and is not Egypt-local → unknown (fail closed).
    return { status: "unknown" };
  }

  const foundById = new Map<string, { customer: TrustedChannelCustomerMatch; matchedPhone: string }>();

  for (const phone of uniqueVariants) {
    const result = await input.findByPhone(phone);
    if (result.status === "duplicate") {
      return { status: "ambiguous", matchCount: result.count ?? 2 };
    }
    if (result.status === "found" && result.customer?.id) {
      // D5.4 Gap 5: legacy fallback must ignore rows that already have a phone_e164
      // (avoids matching a conflicting canonical identity after an e164 miss).
      const existingE164 =
        typeof result.customer.phoneE164 === "string" ? result.customer.phoneE164.trim() : "";
      if (existingE164) {
        continue;
      }
      const existing = foundById.get(result.customer.id);
      if (!existing) {
        foundById.set(result.customer.id, {
          customer: result.customer,
          matchedPhone: phone,
        });
      }
    }
  }

  if (foundById.size === 0) return { status: "unknown" };

  let only: { customer: TrustedChannelCustomerMatch; matchedPhone: string } | undefined;

  if (foundById.size === 1) {
    only = [...foundById.values()][0]!;
  } else {
    // Multiple phone matches — fail closed unless an admin override picks one
    // customer that is already in the match set (no invent / no merge).
    const overrideCustomerId = lookupWhatsAppSenderTrustedCustomerOverride({
      companyId,
      senderExternalId: sender,
    });
    if (overrideCustomerId && foundById.has(overrideCustomerId)) {
      only = foundById.get(overrideCustomerId)!;
    } else {
      return { status: "ambiguous", matchCount: foundById.size };
    }
  }

  return toKnownResult(only, "legacy_phone");
}
