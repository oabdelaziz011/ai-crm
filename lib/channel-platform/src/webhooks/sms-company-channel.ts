import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { SmsCredentialsLoader } from "../adapters/sms/twilio-sms-canonical-credentials.js";
import { ValidationError } from "../errors.js";

export async function resolveSmsCompanyChannel(
  ports: ChannelPlatformPorts,
  companyChannelId: string,
  credentialsLoader: SmsCredentialsLoader,
): Promise<{ companyId: string; channelKey: string; authToken: string; fromNumber: string }> {
  const channel = await ports.registry.getCompanyChannel(companyChannelId);
  if (!channel || channel.channelKey !== "sms" || !channel.isEnabled) {
    throw new ValidationError("SMS company channel not found.");
  }

  const credentials = await credentialsLoader.loadByCompanyId(channel.companyId);
  if (!credentials?.enabled) {
    throw new ValidationError("SMS channel is disabled.");
  }
  if (!credentials.authToken.trim()) {
    throw new ValidationError("SMS credentials are not configured.");
  }

  return {
    companyId: channel.companyId,
    channelKey: "sms",
    authToken: credentials.authToken,
    fromNumber: credentials.fromNumber,
  };
}

/**
 * Resolve company_channel id when Twilio posts to the global SMS webhook.
 * Matches Twilio "To" (our sender) against company_sms_settings.from_number.
 */
export async function resolveSmsCompanyChannelIdByToNumber(
  client: SupabaseClient,
  toNumber: string,
): Promise<string | null> {
  const normalized = toNumber.trim();
  if (!normalized) return null;

  const { data: settingsRows, error: settingsError } = await client
    .from("company_sms_settings")
    .select("company_id, from_number, enabled")
    .eq("enabled", true)
    .eq("from_number", normalized);

  if (settingsError) {
    throw new ValidationError(`SMS To-number lookup failed: ${settingsError.message}`);
  }

  const matches = (settingsRows ?? []).filter(
    (row) => String(row.from_number ?? "").trim() === normalized,
  );
  if (matches.length !== 1) return null;

  const companyId = String(matches[0]?.company_id ?? "");
  if (!companyId) return null;

  const { data: channelRows, error: channelError } = await client
    .from("company_channels")
    .select("id, is_enabled, deleted_at, communication_channels!inner(key)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .eq("is_enabled", true)
    .eq("communication_channels.key", "sms");

  if (channelError) {
    throw new ValidationError(`SMS channel lookup failed: ${channelError.message}`);
  }

  const channels = channelRows ?? [];
  if (channels.length === 0) return null;
  return String(channels[0]?.id ?? "") || null;
}
