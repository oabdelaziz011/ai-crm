import { formatChannelUsername } from "./conversation-contact-identity";

export type ContactDisplayInput = {
  name?: string | null;
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  channelUsername?: string | null;
  channel?: string | null;
  conversationId?: string | null;
  metadataPhone?: string | null;
  visitorLabel: string;
};

const UNKNOWN_PATTERNS = [/unknown/i, /^—+$/, /^-+$/];

/** Auto-created CRM labels like "Messenger 29316…" / bare PSID — not a real person name. */
export function isMetaChannelPlaceholderName(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  if (/^(messenger|instagram|facebook)\s+\d{8,}$/i.test(trimmed)) return true;
  if (/^\d{10,20}$/.test(trimmed)) return true;
  if (/^\+\d{10,20}$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 15) return true;
  return false;
}

function hasDisplayValue(value: string | null | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (UNKNOWN_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (isMetaChannelPlaceholderName(trimmed)) return false;
  return true;
}

export function resolveContactDisplayName(input: ContactDisplayInput): string {
  const isMetaSocial = input.channel === "messenger" || input.channel === "instagram";

  if (hasDisplayValue(input.name)) return input.name.trim();
  if (hasDisplayValue(input.businessName)) return input.businessName!.trim();

  // Unknown WhatsApp senders: prefer the channel phone over a WA profile nickname
  // so the inbox shows +20… until a CRM customer name exists.
  const phone = input.phone?.trim() || input.metadataPhone?.trim();
  if (input.channel === "whatsapp" && phone) {
    return formatPhoneForDisplay(phone);
  }

  const channelProfileName = resolveChannelProfileDisplayName(input.channelUsername);
  if (channelProfileName) return channelProfileName;

  // Never format Messenger PSID / Instagram IGSID as a "+…" phone.
  if (phone && !isMetaSocial && !isMetaChannelPlaceholderName(phone)) {
    return formatPhoneForDisplay(phone);
  }

  if (input.channelUsername?.trim()) {
    const username = input.channelUsername.trim();
    if (isMetaChannelPlaceholderName(username)) {
      // fall through to visitor label
    } else if (input.channel) {
      return formatChannelUsername(input.channel, username);
    } else {
      return username.startsWith("@") ? username : `@${username}`;
    }
  }

  if (hasDisplayValue(input.email)) return input.email.trim();
  if (input.conversationId) {
    const suffix = input.conversationId.replace(/-/g, "").slice(-4).toUpperCase() || "0000";
    return `${input.visitorLabel} ${suffix}`;
  }
  return input.visitorLabel;
}

/** Display WhatsApp / Egypt mobiles as +20… when digits are present. */
export function formatPhoneForDisplay(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("01") && digits.length === 11) return `+20${digits.slice(1)}`;
  if (/^\d{10,15}$/.test(digits)) return `+${digits}`;
  return trimmed;
}

function resolveChannelProfileDisplayName(channelUsername: string | null | undefined): string | null {
  if (!channelUsername?.trim()) return null;
  const raw = channelUsername.trim();
  if (raw.includes("wa.me/") || raw.includes("://")) return null;
  if (/^\+?\d[\d\s-]{6,}$/.test(raw)) return null;
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

export function shouldHideMetaValue(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "normal"
    || normalized === "low"
    || normalized === "—"
    || normalized === "-"
    || UNKNOWN_PATTERNS.some((pattern) => pattern.test(value));
}

export function formatPriorityLabel(
  priority: string,
  translate: (key: string) => string,
): string | null {
  if (shouldHideMetaValue(priority)) return null;
  return translate(`dashboard.notifications.priority.${priority}`);
}
