/**
 * Phase D5.1 — Canonical WhatsApp outbound phone resolution.
 *
 * Prefer customers.phone_e164; resolve legacy only via shared resolvePhoneIdentity.
 * Never guesses country from company/locale/timezone.
 * Egypt validateEgyptMobilePhone remains available as an explicit compat helper
 * (prepareWhatsAppRecipientPhoneInput) but is NOT the generic outbound path.
 */
import { resolvePhoneIdentity } from "@workspace/ai-tool-router";
import { validateEgyptMobilePhone } from "@workspace/ai-tool-router";
import { validateRecipientPhone } from "@/lib/notifications/providers/whatsapp/services/whatsapp-phone-validator";

export type OutboundPhoneSource =
  | "phone_e164"
  | "legacy_phone"
  | "explicit_e164"
  | "explicit_resolved";

export type CustomerOutboundPhoneFields = {
  phone?: string | null;
  phone_e164?: string | null;
  phoneE164?: string | null;
  region?: string | null;
};

export type ResolveWhatsAppOutboundPhoneInput = CustomerOutboundPhoneFields & {
  companyId?: string | null;
  customerId?: string | null;
};

export type SelectedOutboundPhone = {
  raw: string;
  source: OutboundPhoneSource;
};

/**
 * Egypt-compatible prep helper (NOT the generic international outbound resolver).
 * Prefer resolveWhatsAppOutboundPhone for production outbound.
 */
export function prepareWhatsAppRecipientPhoneInput(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const egypt = validateEgyptMobilePhone(trimmed);
  if (egypt.valid) {
    return `+${egypt.normalized}`;
  }
  return trimmed;
}

/**
 * Pick the preferred raw outbound phone string (not yet validated).
 */
export function selectWhatsAppOutboundPhoneRaw(
  customer: CustomerOutboundPhoneFields,
): SelectedOutboundPhone | null {
  const e164 = (customer.phone_e164 ?? customer.phoneE164)?.trim() || null;
  if (e164) {
    return { raw: e164, source: "phone_e164" };
  }
  const legacy = customer.phone?.trim() || null;
  if (legacy) {
    return { raw: legacy, source: "legacy_phone" };
  }
  return null;
}

export type ResolvedWhatsAppOutboundPhone =
  | {
      ok: true;
      phone: string;
      source: OutboundPhoneSource;
    }
  | {
      ok: false;
      phone: null;
      reason: "missing_phone" | "phone_identity_unresolved" | "invalid_phone_identity";
      source: OutboundPhoneSource | null;
    };

function finalizeE164(
  candidate: string,
  source: OutboundPhoneSource,
): ResolvedWhatsAppOutboundPhone {
  const identity = resolvePhoneIdentity({ phone: candidate, source: "explicit" });
  if (identity.status === "resolved") {
    // numberType may be UNKNOWN (e.g. some US/CA) — still accept valid E.164.
    const validation = validateRecipientPhone(identity.phoneE164);
    if (validation.valid && validation.normalized) {
      return { ok: true, phone: validation.normalized, source };
    }
    return {
      ok: false,
      phone: null,
      reason: "invalid_phone_identity",
      source,
    };
  }

  if (identity.reason === "missing_region" || identity.reason === "empty") {
    return {
      ok: false,
      phone: null,
      reason: identity.reason === "empty" ? "missing_phone" : "phone_identity_unresolved",
      source,
    };
  }

  return {
    ok: false,
    phone: null,
    reason: "invalid_phone_identity",
    source,
  };
}

/**
 * Resolve a Meta-ready E.164 destination.
 *
 * Precedence inside this helper:
 * 1. phone_e164 / phoneE164 (canonical)
 * 2. legacy/explicit phone via resolvePhoneIdentity (+ optional explicit region)
 *
 * Never Egypt-guesses. Never returns a raw local number.
 */
export function resolveWhatsAppOutboundPhone(
  input: ResolveWhatsAppOutboundPhoneInput,
): ResolvedWhatsAppOutboundPhone {
  void input.companyId;
  void input.customerId;

  const e164 = (input.phone_e164 ?? input.phoneE164)?.trim() || null;
  if (e164) {
    return finalizeE164(e164, "phone_e164");
  }

  const phone = input.phone?.trim() || null;
  if (!phone) {
    return { ok: false, phone: null, reason: "missing_phone", source: null };
  }

  const region = input.region?.trim() || null;
  const identity = resolvePhoneIdentity({
    phone,
    region,
    source: "explicit",
  });

  if (identity.status === "resolved") {
    const validation = validateRecipientPhone(identity.phoneE164);
    if (!validation.valid || !validation.normalized) {
      return {
        ok: false,
        phone: null,
        reason: "invalid_phone_identity",
        source: region ? "explicit_resolved" : "legacy_phone",
      };
    }
    return {
      ok: true,
      phone: validation.normalized,
      source: region ? "explicit_resolved" : "legacy_phone",
    };
  }

  if (identity.reason === "missing_region" || identity.reason === "empty") {
    return {
      ok: false,
      phone: null,
      reason: identity.reason === "empty" ? "missing_phone" : "phone_identity_unresolved",
      source: "legacy_phone",
    };
  }

  return {
    ok: false,
    phone: null,
    reason: "invalid_phone_identity",
    source: "legacy_phone",
  };
}

/** True when the customer has any outbound phone candidate (e164 or legacy). */
export function hasWhatsAppOutboundPhoneCandidate(
  customer: CustomerOutboundPhoneFields,
): boolean {
  return selectWhatsAppOutboundPhoneRaw(customer) != null;
}
