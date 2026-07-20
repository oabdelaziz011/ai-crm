import { TransportDeliveryError } from "../errors.js";
import type { ChannelProvider } from "./channel-provider.js";
import type { DeliveryResult, OutboundMessage } from "./models.js";
import type { ChannelProviderRegistry } from "./provider-registry.js";
import { executeWithRetry, type RetryPolicy } from "./retry-policy.js";

export class ChannelTransportService {
  constructor(
    private readonly registry: ChannelProviderRegistry,
    private readonly defaultRetryPolicy: RetryPolicy,
  ) {}

  getProvider(channel: OutboundMessage["channel"]): ChannelProvider {
    return this.registry.get(channel);
  }

  async send(message: OutboundMessage, policy: RetryPolicy = this.defaultRetryPolicy): Promise<DeliveryResult> {
    const provider = this.registry.get(message.channel);
    try {
      return await executeWithRetry(() => provider.send(message), policy);
    } catch (error) {
      throw new TransportDeliveryError(
        error instanceof Error ? error.message : "Outbound delivery failed after retries.",
      );
    }
  }
}
