import { ValidationError } from "../errors.js";
import type { ResolvedCompanyChannel } from "../types.js";

export function assertWebhookCompanyChannel(
  channel: ResolvedCompanyChannel | null,
  expectedChannelKey: string,
): asserts channel is ResolvedCompanyChannel {
  if (!channel) {
    throw new ValidationError("Company channel not found for webhook routing.");
  }

  if (channel.channelKey !== expectedChannelKey) {
    throw new ValidationError(
      `Resolved company channel is not a ${expectedChannelKey} channel (got ${channel.channelKey}).`,
    );
  }

  if (!channel.isEnabled) {
    throw new ValidationError(`${expectedChannelKey} company channel is disabled.`);
  }
}

export function assertChannelSettingsEnabled(
  settings: { enabled?: boolean } | null | undefined,
  channelLabel: string,
): void {
  if (settings?.enabled === false) {
    throw new ValidationError(`${channelLabel} credentials are disabled for this company.`);
  }
}
