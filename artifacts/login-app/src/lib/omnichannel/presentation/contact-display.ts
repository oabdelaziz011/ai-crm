import { formatChannelUsername } from "@/lib/omnichannel/presentation/conversation-contact-identity";

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

function hasDisplayValue(value: string | null | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return !UNKNOWN_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function resolveContactDisplayName(input: ContactDisplayInput): string {
  if (hasDisplayValue(input.name)) return input.name.trim();
  if (hasDisplayValue(input.businessName)) return input.businessName!.trim();

  const channelProfileName = resolveChannelProfileDisplayName(input.channelUsername);
  if (channelProfileName) return channelProfileName;

  const phone = input.phone?.trim() || input.metadataPhone?.trim();
  if (phone) return phone;

  if (input.channelUsername?.trim()) {
    const username = input.channelUsername.trim();
    if (input.channel) return formatChannelUsername(input.channel, username);
    return username.startsWith("@") ? username : `@${username}`;
  }

  if (hasDisplayValue(input.email)) return input.email.trim();
  if (input.conversationId) {
    const suffix = input.conversationId.replace(/-/g, "").slice(-4).toUpperCase() || "0000";
    return `${input.visitorLabel} ${suffix}`;
  }
  return input.visitorLabel;
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
