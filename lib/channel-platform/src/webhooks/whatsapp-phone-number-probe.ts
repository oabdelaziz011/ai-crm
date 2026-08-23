import { whatsAppGraphBaseUrl } from "../adapters/whatsapp/whatsapp-config.js";

export type WhatsAppCredentialProbeChannel = {
  id: string;
  companyId: string;
  configuration: Record<string, unknown>;
};

export type WhatsAppPhoneNumberProbeOptions = {
  fetchFn?: typeof fetch;
  loadAccessToken?: (companyId: string) => Promise<string | null>;
  loadApiVersion?: (companyId: string) => Promise<string | null>;
};

export async function verifyWhatsAppPhoneNumberAccess(
  phoneNumberId: string,
  accessToken: string,
  apiVersion = "v21.0",
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<boolean> {
  const trimmedPhoneNumberId = phoneNumberId.trim();
  const trimmedToken = accessToken.trim();
  if (!trimmedPhoneNumberId || !trimmedToken) return false;

  try {
    const response = await fetchFn(
      `${whatsAppGraphBaseUrl(apiVersion)}/${encodeURIComponent(trimmedPhoneNumberId)}?fields=id`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmedToken}` },
      },
    );

    if (!response.ok) return false;

    const body = (await response.json()) as { id?: string };
    return body.id === trimmedPhoneNumberId;
  } catch {
    return false;
  }
}

export async function probeWhatsAppPhoneNumberChannel(
  phoneNumberId: string,
  channels: WhatsAppCredentialProbeChannel[],
  options: WhatsAppPhoneNumberProbeOptions = {},
): Promise<WhatsAppCredentialProbeChannel | null> {
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const matches: WhatsAppCredentialProbeChannel[] = [];

  for (const channel of channels) {
    const accessToken = options.loadAccessToken
      ? ((await options.loadAccessToken(channel.companyId))?.trim() ?? "")
      : readLegacyChannelAccessToken(channel.configuration);

    if (!accessToken) continue;

    const apiVersion = options.loadApiVersion
      ? ((await options.loadApiVersion(channel.companyId))?.trim() || "v21.0")
      : readLegacyChannelApiVersion(channel.configuration);

    const ownsPhoneNumber = await verifyWhatsAppPhoneNumberAccess(
      phoneNumberId,
      accessToken,
      apiVersion,
      fetchFn,
    );
    if (ownsPhoneNumber) matches.push(channel);
  }

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    const companyIds = new Set(matches.map((match) => match.companyId));
    if (companyIds.size === 1) return matches[0]!;
  }
  return null;
}

function readLegacyChannelAccessToken(configuration: Record<string, unknown>): string {
  const value = configuration.accessToken;
  return typeof value === "string" ? value.trim() : "";
}

function readLegacyChannelApiVersion(configuration: Record<string, unknown>): string {
  const value = configuration.apiVersion;
  return typeof value === "string" && value.trim() ? value.trim() : "v21.0";
}
