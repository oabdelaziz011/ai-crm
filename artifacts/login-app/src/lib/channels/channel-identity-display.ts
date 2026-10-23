import type { CompanyChannelRecord } from "@workspace/channel-registry";

export type MessagingChannelKey = "whatsapp" | "messenger" | "instagram" | "web_chat";

export type ChannelIdentityField = {
  key: "phoneNumberId" | "pageId" | "fromEmail" | "verifyToken" | "webhookUrl" | "externalAccountId";
  value: string;
  secret?: boolean;
};

const MESSAGING_KEYS = new Set<string>(["whatsapp", "messenger", "instagram", "web_chat"]);

function readConfigString(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

export function channelTypeKey(channel: CompanyChannelRecord): string {
  return channel.communication_channel?.key?.trim() || "unknown";
}

export function isMessagingChannelKey(key: string | undefined): key is MessagingChannelKey {
  return Boolean(key && MESSAGING_KEYS.has(key));
}

export function maskSecret(value: string, visible = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= visible * 2) return "•".repeat(Math.min(trimmed.length, 8));
  return `${trimmed.slice(0, visible)}…${trimmed.slice(-visible)}`;
}

/**
 * Stable identity for true duplicates only.
 * Never group by display name alone — two emails named the same are not duplicates
 * unless they share fromEmail / page / phone / external account.
 * Web Chat is keyed by provider + surface so internal chat and public widgets
 * stay distinct, while duplicate widgets/internal rows collapse together.
 */
export function channelDuplicateKey(channel: CompanyChannelRecord): string | null {
  const key = channelTypeKey(channel);
  const configuration = channel.configuration ?? {};
  const phoneNumberId = readConfigString(configuration, "phoneNumberId");
  const pageId = readConfigString(configuration, "pageId");
  const fromEmail = readConfigString(configuration, "fromEmail").toLowerCase();
  const external = (channel.external_account_id ?? "").trim();
  if (key === "web_chat") {
    const surface = readConfigString(configuration, "surface") || "internal";
    const provider = (channel.provider || "generic.web_chat").trim().toLowerCase();
    return `${key}::${provider}::${surface}`;
  }
  const identity = phoneNumberId || pageId || fromEmail || external;
  if (!identity) return null;
  return `${key}::${identity}`;
}

/**
 * "Working" must match live send/receive, not only company_channels.health_status.
 * WhatsApp often stays "unknown" because credentials live in company_whatsapp_settings
 * while the channel row only stores a credentialsSource / phoneNumberId pointer.
 */
export function isChannelWorking(
  channel: CompanyChannelRecord,
  options?: { whatsappSettingsReady?: boolean },
): boolean {
  if (!channel.is_enabled || channel.status !== "active") return false;
  if (channel.health_status === "error" || channel.health_status === "disconnected") {
    return false;
  }
  if (channel.health_status === "connected" || channel.health_status === "warning") {
    return true;
  }

  const key = channelTypeKey(channel);
  const configuration = channel.configuration ?? {};
  if (key === "web_chat") return true;
  if (key === "whatsapp") {
    if (options?.whatsappSettingsReady === true) return true;
    const phoneNumberId = readConfigString(configuration, "phoneNumberId");
    const credentialsSource = readConfigString(configuration, "credentialsSource");
    return Boolean(phoneNumberId || credentialsSource === "company_whatsapp_settings");
  }
  if (key === "messenger" || key === "instagram") {
    return Boolean(
      readConfigString(configuration, "pageId") || (channel.external_account_id ?? "").trim(),
    );
  }
  if (key === "email") {
    return Boolean(readConfigString(configuration, "fromEmail"));
  }
  return false;
}

export function resolveBoundAiEmployeeForChannel(
  employees: Array<{ id: string; displayName: string; name: string; tags: string[] }>,
  channelKey: string,
  companyChannelId: string,
): { id: string; displayName: string } | null {
  let best: { id: string; displayName: string; score: number } | null = null;
  for (const employee of employees) {
    const tags = employee.tags ?? [];
    let score = 0;
    if (tags.includes(`channel:${companyChannelId}`)) score += 100;
    if (tags.includes(`channel:${channelKey}`)) score += 50;
    if (tags.includes("capability:omnichannel")) score += 10;
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = {
        id: employee.id,
        displayName: employee.displayName?.trim() || employee.name?.trim() || employee.id,
        score,
      };
    }
  }
  return best ? { id: best.id, displayName: best.displayName } : null;
}

export function channelIdentityFields(channel: CompanyChannelRecord): ChannelIdentityField[] {
  const key = channelTypeKey(channel);
  const configuration = channel.configuration ?? {};
  const fields: ChannelIdentityField[] = [];

  const phoneNumberId = readConfigString(configuration, "phoneNumberId");
  if (phoneNumberId) fields.push({ key: "phoneNumberId", value: phoneNumberId });

  const pageId = readConfigString(configuration, "pageId");
  if (pageId) fields.push({ key: "pageId", value: pageId });

  const fromEmail = readConfigString(configuration, "fromEmail");
  if (fromEmail) fields.push({ key: "fromEmail", value: fromEmail });

  const verifyToken = readConfigString(configuration, "verifyToken");
  if (verifyToken) fields.push({ key: "verifyToken", value: verifyToken, secret: true });

  const webhookUrl = (channel.webhook_url ?? "").trim();
  if (webhookUrl) fields.push({ key: "webhookUrl", value: webhookUrl });

  const external = (channel.external_account_id ?? "").trim();
  if (external && !phoneNumberId && !pageId && !fromEmail) {
    fields.push({ key: "externalAccountId", value: external });
  }

  if (key === "web_chat" && fields.length === 0) {
    fields.push({ key: "externalAccountId", value: channel.id });
  }

  return fields;
}

/**
 * Prefer the enabled/connected/default channel; keep others as duplicates
 * so the UI can soft-delete them without removing the live connection.
 */
export function partitionPrimaryChannels(channels: CompanyChannelRecord[]): {
  visible: CompanyChannelRecord[];
  duplicates: CompanyChannelRecord[];
  duplicateIds: Set<string>;
} {
  const groups = new Map<string, CompanyChannelRecord[]>();
  const ungrouped: CompanyChannelRecord[] = [];

  for (const channel of channels) {
    const key = channelDuplicateKey(channel);
    if (!key) {
      ungrouped.push(channel);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(channel);
    groups.set(key, list);
  }

  const score = (channel: CompanyChannelRecord): number => {
    let value = 0;
    if (channel.is_enabled) value += 100;
    if (channel.is_default) value += 40;
    if (channel.health_status === "connected") value += 30;
    if (channel.health_status === "warning") value += 10;
    if (channel.status === "active") value += 5;
    value += Date.parse(channel.updated_at) / 1e13;
    return value;
  };

  const visible: CompanyChannelRecord[] = [...ungrouped];
  const duplicates: CompanyChannelRecord[] = [];
  const duplicateIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      visible.push(group[0]!);
      continue;
    }
    const ranked = [...group].sort((left, right) => score(right) - score(left));
    visible.push(ranked[0]!);
    for (const extra of ranked.slice(1)) {
      duplicates.push(extra);
      duplicateIds.add(extra.id);
    }
  }

  visible.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  return { visible, duplicates, duplicateIds };
}
