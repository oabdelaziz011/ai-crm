/**
 * Canonical inbound CRM resolve-or-create
 * (WhatsApp / Email / SMS / Messenger / Instagram).
 *
 * - Resolve existing customer first (company-scoped).
 * - On unknown: create once with first-touch source + status active (DB default).
 * - On unique-constraint race: re-resolve and return the winner.
 * - Never overwrite source / lifecycle / profile on existing customers.
 * - Never invent DOB / gender / notes.
 * - web_chat is intentionally unsupported (anonymous session ≠ CRM identity).
 */

import { buildCustomerPhoneIdentityColumns } from "./customer-phone-identity-dual-write.js";
import { resolvePhoneIdentity } from "./phone-identity-resolver.js";
import {
  normalizeMetaChannelExternalId,
  normalizeTrustedEmailSender,
  resolveTrustedChannelCustomer,
  resolveWhatsAppSenderPhoneE164,
  type ResolveTrustedChannelCustomerInput,
  type ResolveTrustedChannelCustomerResult,
} from "./resolve-trusted-channel-customer.js";

type InboundAcquisitionSource = "whatsapp" | "email" | "sms" | "messenger" | "instagram";

function inboundSourceFromChannelKey(channelKey: string): InboundAcquisitionSource | null {
  switch (channelKey) {
    case "whatsapp":
      return "whatsapp";
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "messenger":
      return "messenger";
    case "instagram":
      return "instagram";
    default:
      return null;
  }
}

export type InboundCustomerCreateDraft = {
  name: string;
  email?: string | null;
  phone?: string | null;
  source: InboundAcquisitionSource;
  phoneIdentity?: {
    phone_e164: string | null;
    phone_country_iso: string | null;
    phone_region_source: "explicit" | "e164" | "channel" | "import" | "unresolved" | null;
    phone_national: string | null;
  } | null;
  /** Messenger PSID / Instagram IGSID — persisted in customer_channel_identities. */
  channelIdentity?: {
    channelKey: "messenger" | "instagram";
    externalId: string;
  } | null;
};

export type ResolveOrCreateInboundCustomerInput = ResolveTrustedChannelCustomerInput & {
  /** Optional trustworthy display name from channel profile / From header. */
  senderDisplayName?: string | null;
  /**
   * Create callback — must be company-scoped and use a tenant actor userId.
   * Called only when resolve returns unknown and a safe draft can be built.
   */
  createCustomer: (draft: InboundCustomerCreateDraft) => Promise<{
    id: string;
    name: string;
  }>;
  /** Optional structured logger; failures must not throw into inbound pipeline. */
  onError?: (detail: {
    code: string;
    channelKey: string;
    companyId: string;
    message: string;
  }) => void;
};

export type ResolveOrCreateInboundCustomerResult = ResolveTrustedChannelCustomerResult & {
  created?: boolean;
};

function trimDisplayName(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!trimmed || trimmed.length > 120) return null;
  if (/^(unknown|n\/a|null|undefined)$/i.test(trimmed)) return null;
  return trimmed;
}

function emailLocalPart(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  return local || email;
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unique constraint|duplicate key|phone_e164|company_phone_e164|idx_customers_company_email|idx_customers_company_phone|customer_channel_identities|idx_customer_channel_identities/i.test(
    message,
  );
}

/**
 * Build a create draft from channel identity. Returns null when identity is not safe to persist.
 */
export function buildInboundCustomerCreateDraft(input: {
  channelKey: string;
  senderExternalId: string | null | undefined;
  senderDisplayName?: string | null;
}): InboundCustomerCreateDraft | null {
  const channelKey = String(input.channelKey ?? "")
    .trim()
    .toLowerCase();
  const sender = typeof input.senderExternalId === "string" ? input.senderExternalId.trim() : "";
  if (!sender) return null;

  const source = inboundSourceFromChannelKey(channelKey);
  if (!source) {
    return null;
  }

  const displayName = trimDisplayName(input.senderDisplayName);

  if (channelKey === "messenger" || channelKey === "instagram") {
    const externalId = normalizeMetaChannelExternalId(sender);
    if (!externalId) return null;
    const label = channelKey === "messenger" ? "Messenger" : "Instagram";
    return {
      name: displayName ?? `${label} ${externalId}`,
      email: null,
      phone: null,
      source,
      phoneIdentity: null,
      channelIdentity: { channelKey, externalId },
    };
  }

  if (channelKey === "email") {
    const email = normalizeTrustedEmailSender(sender);
    if (!email) return null;
    return {
      name: displayName ?? emailLocalPart(email),
      email,
      phone: null,
      source: "email",
      phoneIdentity: null,
      channelIdentity: null,
    };
  }

  if (channelKey === "sms") {
    const resolved = resolvePhoneIdentity({ phone: sender, source: "channel" });
    const e164Pattern = /^\+[1-9]\d{6,14}$/;
    const phoneE164 =
      resolved.status === "resolved"
        ? resolved.phoneE164
        : e164Pattern.test(sender)
          ? sender
          : null;
    if (!phoneE164) return null;
    const identity =
      resolved.status === "resolved"
        ? buildCustomerPhoneIdentityColumns({
            phone: phoneE164,
            source: "channel",
          })
        : {
            phone_e164: phoneE164,
            phone_country_iso: null,
            phone_region_source: "e164" as const,
            phone_national: null,
          };
    if (!identity.phone_e164) return null;
    return {
      name: displayName ?? `SMS ${phoneE164}`,
      email: null,
      phone: phoneE164,
      source: "sms",
      phoneIdentity: identity,
      channelIdentity: null,
    };
  }

  // WhatsApp
  const phoneE164 = resolveWhatsAppSenderPhoneE164(sender);
  if (!phoneE164) {
    return null;
  }
  const identity = buildCustomerPhoneIdentityColumns({
    phone: phoneE164,
    source: "channel",
  });
  if (!identity.phone_e164) return null;
  return {
    name: displayName ?? `WhatsApp ${phoneE164}`,
    email: null,
    phone: phoneE164,
    source: "whatsapp",
    phoneIdentity: identity,
    channelIdentity: null,
  };
}

/**
 * Resolve existing customer, or create once when unknown.
 * Does not create on ambiguous / invalid / unsupported.
 */
export async function resolveOrCreateCustomerFromInbound(
  input: ResolveOrCreateInboundCustomerInput,
): Promise<ResolveOrCreateInboundCustomerResult> {
  const resolved = await resolveTrustedChannelCustomer(input);

  if (resolved.status !== "unknown") {
    return { ...resolved, created: false };
  }

  const draft = buildInboundCustomerCreateDraft({
    channelKey: input.channelKey,
    senderExternalId: input.senderExternalId,
    senderDisplayName: input.senderDisplayName,
  });

  if (!draft) {
    return { status: "unknown", created: false };
  }

  try {
    const created = await input.createCustomer(draft);
    const displayName = resolveTrustedChannelCustomerName(created.name, draft.name);
    const matched =
      draft.channelIdentity?.externalId ?? draft.email ?? draft.phone ?? "";
    return {
      status: "known",
      customerId: created.id,
      trustedCustomerName: displayName,
      matchedPhone: matched,
      matchSource: draft.channelIdentity
        ? "channel_external_id"
        : draft.source === "email"
          ? "legacy_phone"
          : "phone_e164",
      created: true,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await resolveTrustedChannelCustomer(input);
      if (raced.status === "known") {
        return { ...raced, created: false };
      }
      input.onError?.({
        code: "INBOUND_CUSTOMER_CREATE_RACE_UNRESOLVED",
        channelKey: input.channelKey,
        companyId: input.companyId,
        message: error instanceof Error ? error.message : String(error),
      });
      return { status: "unknown", created: false };
    }

    input.onError?.({
      code: "INBOUND_CUSTOMER_CREATE_FAILED",
      channelKey: input.channelKey,
      companyId: input.companyId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "unknown", created: false };
  }
}

function resolveTrustedChannelCustomerName(createdName: string, draftName: string): string {
  const fromCreated = typeof createdName === "string" ? createdName.trim() : "";
  if (fromCreated) return fromCreated;
  return draftName;
}
