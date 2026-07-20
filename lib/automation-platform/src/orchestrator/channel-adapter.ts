import type { AutomationChannel } from "../constants.js";
import { ChannelAdapterError } from "../errors.js";
import type { NormalizedInboundMessage, NormalizedOutboundMessage } from "../types.js";

export interface ChannelAdapter {
  readonly channel: AutomationChannel;
  normalize(raw: unknown, companyId: string): NormalizedInboundMessage;
  receive(raw: unknown, companyId: string): Promise<NormalizedInboundMessage>;
  send(message: NormalizedOutboundMessage): Promise<void>;
}

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly channel: AutomationChannel;

  normalize(raw: unknown, companyId: string): NormalizedInboundMessage {
    if (!raw || typeof raw !== "object") {
      throw new ChannelAdapterError("Inbound payload must be an object.");
    }
    const payload = raw as Record<string, unknown>;
    const externalUserId = typeof payload.externalUserId === "string" ? payload.externalUserId.trim() : "";
    if (!externalUserId) throw new ChannelAdapterError("Inbound payload requires externalUserId.");
    const text = typeof payload.text === "string" ? payload.text : "";
    return {
      channel: this.channel,
      companyId,
      externalUserId,
      customerId: typeof payload.customerId === "string" ? payload.customerId : null,
      messageType: "text",
      text,
      payload: { ...payload, text },
      receivedAt: new Date().toISOString(),
      externalMessageId: typeof payload.externalMessageId === "string" ? payload.externalMessageId : null,
    };
  }

  async receive(raw: unknown, companyId: string): Promise<NormalizedInboundMessage> {
    return this.normalize(raw, companyId);
  }

  async send(_message: NormalizedOutboundMessage): Promise<void> {
    /* channel transports implemented in future sprints */
  }
}

export class WebChatChannelAdapter extends BaseChannelAdapter {
  readonly channel = "web_chat" as const;
}

export class ApiChannelAdapter extends BaseChannelAdapter {
  readonly channel = "api" as const;
}

export class EmailChannelAdapter extends BaseChannelAdapter {
  readonly channel = "email" as const;
}

export class ChannelAdapterRegistry {
  private readonly adapters = new Map<AutomationChannel, ChannelAdapter>();

  register(adapter: ChannelAdapter): this {
    this.adapters.set(adapter.channel, adapter);
    return this;
  }

  get(channel: AutomationChannel): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new ChannelAdapterError(`No channel adapter registered for ${channel}.`);
    return adapter;
  }
}

export function createDefaultChannelAdapterRegistry(): ChannelAdapterRegistry {
  return new ChannelAdapterRegistry()
    .register(new WebChatChannelAdapter())
    .register(new ApiChannelAdapter())
    .register(new EmailChannelAdapter());
}
