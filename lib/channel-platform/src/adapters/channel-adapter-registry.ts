import { ChannelAdapterNotFoundError } from "../errors.js";
import type { ChannelAdapterPort, ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";

export class ChannelAdapterRegistry implements ChannelAdapterRegistryPort {
  private readonly adapters = new Map<string, ChannelAdapterPort>();

  register(adapter: ChannelAdapterPort): void {
    this.adapters.set(adapter.channelKey, adapter);
  }

  get(channelKey: string): ChannelAdapterPort | null {
    return this.adapters.get(channelKey) ?? null;
  }

  require(channelKey: string): ChannelAdapterPort {
    const adapter = this.get(channelKey);
    if (!adapter) throw new ChannelAdapterNotFoundError(channelKey);
    return adapter;
  }
}

export function createChannelAdapterRegistry(adapters: ChannelAdapterPort[] = []): ChannelAdapterRegistry {
  const registry = new ChannelAdapterRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
}
