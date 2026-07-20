import type { AutomationChannel } from "../constants.js";
import { ChannelProviderNotFoundError } from "../errors.js";
import type { ChannelProvider } from "./channel-provider.js";
import { createBuiltInChannelProviders } from "./stub-providers.js";
import type { WhatsAppConfigResolver } from "./whatsapp/whatsapp-config.js";
import { createWhatsAppProvider } from "./whatsapp/whatsapp-provider.js";

export type ChannelProviderRegistryOptions = {
  whatsappConfigResolver?: WhatsAppConfigResolver;
  fetchFn?: typeof fetch;
};

export class ChannelProviderRegistry {
  private readonly providers = new Map<AutomationChannel, ChannelProvider>();

  register(provider: ChannelProvider): this {
    this.providers.set(provider.channel, provider);
    return this;
  }

  registerMany(providers: ChannelProvider[]): this {
    for (const provider of providers) this.register(provider);
    return this;
  }

  get(channel: AutomationChannel): ChannelProvider {
    const provider = this.providers.get(channel);
    if (!provider) throw new ChannelProviderNotFoundError(channel);
    return provider;
  }

  has(channel: AutomationChannel): boolean {
    return this.providers.has(channel);
  }

  list(): ChannelProvider[] {
    return [...this.providers.values()];
  }
}

export function createDefaultChannelProviderRegistry(
  options: ChannelProviderRegistryOptions = {},
): ChannelProviderRegistry {
  const providers: ChannelProvider[] = [...createBuiltInChannelProviders()];
  if (options.whatsappConfigResolver) {
    providers.push(createWhatsAppProvider({ configResolver: options.whatsappConfigResolver, fetchFn: options.fetchFn }));
  }
  return new ChannelProviderRegistry().registerMany(providers);
}
