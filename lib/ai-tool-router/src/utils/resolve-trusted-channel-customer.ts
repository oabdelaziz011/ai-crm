import {
  normalizeEgyptMobilePhone,
  validateEgyptMobilePhone,
} from "./customer-phone-normalization.js"; // reuse existing Egypt mobile helpers — do not add a second normalizer

export type TrustedChannelCustomerMatch = {
  id: string;
  name: string;
  phone: string | null;
};

export type ResolveTrustedChannelCustomerInput = {
  companyId: string;
  channelKey: string;
  senderExternalId: string | null | undefined;
  /**
   * Company-scoped CRM lookup by exact phone string.
   * Must already filter by companyId — never search globally.
   */
  findByPhone: (phone: string) => Promise<{
    status: "found" | "not_found" | "duplicate";
    customer?: TrustedChannelCustomerMatch | null;
    count?: number;
  }>;
};

export type ResolveTrustedChannelCustomerResult =
  | {
      status: "known";
      customerId: string;
      trustedCustomerName: string;
      matchedPhone: string;
    }
  | { status: "unknown" }
  | { status: "ambiguous"; matchCount: number }
  | { status: "unsupported_channel" }
  | { status: "invalid_sender" };

/**
 * Build safe phone lookup variants for WhatsApp Meta `message.from` (e.g. 2010…)
 * against CRM storage that may use local (010…) or E.164 (2010…) forms.
 * Reuses existing Egypt mobile normalization — does not invent a second utility.
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
    }
    return [...variants];
  }

  const variants = new Set<string>([validated.normalized, validated.local]);
  // Also include bare national without leading 0 (rare CRM storage).
  if (validated.local.startsWith("0") && validated.local.length === 11) {
    variants.add(validated.local.slice(1));
  }
  return [...variants];
}

/**
 * Resolve trusted CRM identity from a channel sender id.
 * WhatsApp only in Phase 2. Fail closed on ambiguity / cross-variant conflicts.
 * Never trusts senderName, LLM customerId, or companyId from payload.
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

  const variants = buildWhatsAppSenderPhoneLookupVariants(sender);
  if (variants.length === 0) return { status: "unknown" };

  const foundById = new Map<string, { customer: TrustedChannelCustomerMatch; matchedPhone: string }>();

  for (const phone of variants) {
    const result = await input.findByPhone(phone);
    if (result.status === "duplicate") {
      return { status: "ambiguous", matchCount: result.count ?? 2 };
    }
    if (result.status === "found" && result.customer?.id) {
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
  if (foundById.size > 1) {
    return { status: "ambiguous", matchCount: foundById.size };
  }

  const only = [...foundById.values()][0]!;
  const name = only.customer.name?.trim() ?? "";
  if (!name) {
    // CRM record without a name is still a trusted id, but welcome must stay generic.
    return {
      status: "known",
      customerId: only.customer.id,
      trustedCustomerName: "",
      matchedPhone: only.matchedPhone,
    };
  }

  return {
    status: "known",
    customerId: only.customer.id,
    trustedCustomerName: name,
    matchedPhone: only.matchedPhone,
  };
}
