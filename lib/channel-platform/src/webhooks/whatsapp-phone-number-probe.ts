import { whatsAppGraphBaseUrl } from "../adapters/whatsapp/whatsapp-config.js";

export type WhatsAppCredentialProbeChannel = {
  id: string;
  companyId: string;
  configuration: Record<string, unknown>;
};

export type WhatsAppPhoneNumberProbeOptions = {
  fetchFn?: typeof fetch;
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
    const accessToken = channel.configuration.accessToken;
    if (typeof accessToken !== "string" || !accessToken.trim()) continue;

    const apiVersion =
      typeof channel.configuration.apiVersion === "string" && channel.configuration.apiVersion.trim()
        ? channel.configuration.apiVersion.trim()
        : "v21.0";

    const ownsPhoneNumber = await verifyWhatsAppPhoneNumberAccess(
      phoneNumberId,
      accessToken,
      apiVersion,
      fetchFn,
    );
    if (ownsPhoneNumber) matches.push(channel);
  }

  if (matches.length === 1) return matches[0]!;
  return null;
}
