import { isValidAvatarUrl, normalizeAvatarUrl } from "@/lib/avatar-url";
import {
  buildContactDisplayInput,
  extractContactIdentityFromMetadata,
} from "@/lib/omnichannel/presentation/conversation-contact-identity";
import { resolveContactDisplayName } from "@/lib/omnichannel/presentation/contact-display";
import type {
  OmnichannelChannelKey,
  OmnichannelCustomerRef,
  UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";

/**
 * Shared Omnichannel conversation identity avatar model.
 * Image URLs are accepted only when already present on conversation/customer
 * data already loaded for this company — never fetched, invented, or mocked.
 */

export type ConversationIdentityAvatarSource = "provider" | "crm" | "conversation" | "fallback";

export type ConversationIdentityAvatarModel = {
  displayName: string;
  initials: string;
  imageUrl: string | null;
  channel: OmnichannelChannelKey | string;
  source: ConversationIdentityAvatarSource;
  /** CRM customer name when linked — never replaced by provider nickname for CRM identity. */
  customerName: string | null;
  customerId: string | null;
  isLinkedCustomer: boolean;
  companyId: string | null;
};

/** Metadata keys that would hold a provider profile image IF inbound ever persisted one. */
const PROVIDER_PROFILE_IMAGE_KEYS = [
  "profileImageUrl",
  "profile_image_url",
  "profilePicUrl",
  "profile_pic_url",
  "profilePic",
  "profile_pic",
  "senderProfileImageUrl",
  "sender_profile_image_url",
  "whatsappProfilePic",
  "whatsapp_profile_pic",
  "messengerProfilePic",
  "messenger_profile_pic",
  "instagramProfilePic",
  "instagram_profile_pic",
  "avatarUrl",
  "avatar_url",
] as const;

function readTrustedImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeAvatarUrl(raw);
  if (!normalized) return null;
  if (!isValidAvatarUrl(normalized)) return null;
  // Omnichannel conversation avatars: only remote HTTPS (or validated storage paths).
  // Reject inline data URLs here to avoid embedding untrusted blobs as "provider" photos.
  if (normalized.startsWith("data:")) return null;
  return normalized;
}

function readProviderProfileImageUrl(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  for (const key of PROVIDER_PROFILE_IMAGE_KEYS) {
    const url = readTrustedImageUrl(metadata[key]);
    if (url) return url;
  }
  return null;
}

export function buildConversationIdentityInitials(displayName: string): string {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

export type ResolveConversationIdentityAvatarInput = {
  conversation: UnifiedConversation | null | undefined;
  /** Optional header/CRM customer override (must already be company-scoped). */
  customer?: OmnichannelCustomerRef | null;
  visitorLabel?: string;
  /**
   * Optional expected company id — when set, a mismatch yields fallback-only
   * (no image) so another tenant's URL cannot leak into this render.
   */
  expectedCompanyId?: string | null;
};

/**
 * Resolve avatar presentation from already-loaded conversation + CRM refs.
 * Sync — no network. Priority: provider image → CRM avatar → initials.
 * Display name prefers CRM customer name over channel nicknames.
 */
export function resolveConversationIdentityAvatar(
  input: ResolveConversationIdentityAvatarInput,
): ConversationIdentityAvatarModel {
  const conversation = input.conversation ?? null;
  const visitorLabel = input.visitorLabel ?? "Visitor";
  const customer = input.customer ?? conversation?.customer ?? null;
  const companyId = conversation?.companyId ?? null;

  const tenantMismatch =
    Boolean(input.expectedCompanyId) &&
    Boolean(companyId) &&
    input.expectedCompanyId !== companyId;

  const displayName = conversation
    ? resolveContactDisplayName(
        buildContactDisplayInput(conversation, customer, visitorLabel),
      )
    : customer?.name?.trim() || visitorLabel;

  const linkedId = customer?.id?.trim() || conversation?.source.customer_id?.trim() || null;
  const isLinkedCustomer = Boolean(linkedId);
  const customerName = customer?.name?.trim() || null;

  if (tenantMismatch) {
    return {
      displayName,
      initials: buildConversationIdentityInitials(displayName),
      imageUrl: null,
      channel: conversation?.channel ?? "web_chat",
      source: "fallback",
      customerName,
      customerId: linkedId,
      isLinkedCustomer,
      companyId,
    };
  }

  const providerUrl = readProviderProfileImageUrl(conversation?.source.metadata ?? null);
  if (providerUrl) {
    return {
      displayName,
      initials: buildConversationIdentityInitials(displayName),
      imageUrl: providerUrl,
      channel: conversation?.channel ?? "web_chat",
      source: "provider",
      customerName,
      customerId: linkedId,
      isLinkedCustomer,
      companyId,
    };
  }

  const crmUrl = readTrustedImageUrl(customer?.avatarUrl ?? null);
  if (crmUrl) {
    return {
      displayName,
      initials: buildConversationIdentityInitials(displayName),
      imageUrl: crmUrl,
      channel: conversation?.channel ?? "web_chat",
      source: "crm",
      customerName,
      customerId: linkedId,
      isLinkedCustomer,
      companyId,
    };
  }

  // Channel profile text (senderName etc.) may inform displayName via contact-display,
  // but there is no conversation-persisted image URL today → initials.
  const metadataIdentity = extractContactIdentityFromMetadata(conversation?.source.metadata);
  const hasChannelIdentity = Boolean(
    metadataIdentity.channelUsername || metadataIdentity.phone || metadataIdentity.email,
  );

  return {
    displayName,
    initials: buildConversationIdentityInitials(displayName),
    imageUrl: null,
    channel: conversation?.channel ?? "web_chat",
    source: hasChannelIdentity ? "conversation" : "fallback",
    customerName,
    customerId: linkedId,
    isLinkedCustomer,
    companyId,
  };
}
