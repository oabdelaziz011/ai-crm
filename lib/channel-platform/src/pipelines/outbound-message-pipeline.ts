import type { ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { OutboundDispatchRequestDto, OutboundDispatchResponseDto } from "../dto/channel-dto.js";
import type { ChannelSessionRepository } from "../repositories/channel-platform-repositories.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import { CompanyChannelNotFoundError, PermissionDeniedError, ValidationError } from "../errors.js";
import type { ServiceContext } from "../types.js";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";

export class OutboundMessagePipeline {
  constructor(
    private readonly ports: ChannelPlatformPorts,
    private readonly adapterRegistry: ChannelAdapterRegistryPort,
    private readonly deliveryEngine: DeliveryTrackingEngine,
    private readonly sessionRepository: ChannelSessionRepository,
  ) {}

  async process(ctx: ServiceContext, request: OutboundDispatchRequestDto): Promise<OutboundDispatchResponseDto> {
    this.assertDispatchPermission(ctx, request.companyId);

    const companyChannel = await this.ports.registry.getCompanyChannel(request.companyChannelId);
    if (!companyChannel || companyChannel.companyId !== request.companyId) {
      throw new CompanyChannelNotFoundError(request.companyChannelId);
    }

    const adapter = this.adapterRegistry.require(request.channelKey);
    const text = request.text.trim();
    if (!text) throw new ValidationError("Outbound message text is required.");

    const persistConversationMessage = request.persistConversationMessage ?? true;
    let outboundMessageId = request.outboundMessageId;

    if (persistConversationMessage && !outboundMessageId) {
      const outboundMessage = await this.ports.conversation.addOutgoingMessage({
        conversationId: request.conversationId,
        content: text,
        metadata: request.metadata,
      });
      outboundMessageId = outboundMessage.id;
    }

    const delivery = await this.deliveryEngine.createPendingDelivery({
      companyId: request.companyId,
      companyChannelId: request.companyChannelId,
      channelKey: request.channelKey,
      conversationId: request.conversationId,
      channelSessionId: request.channelSessionId,
      outboundMessageId: outboundMessageId ?? null,
      externalThreadId: request.externalThreadId,
      payload: {
        text,
        attachments: request.attachments ?? [],
        metadata: request.metadata ?? {},
      },
    });

    const formatted = adapter.formatOutbound(
      { companyChannel },
      {
        conversationId: request.conversationId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        externalThreadId: request.externalThreadId,
        text,
        attachments: request.attachments,
        metadata: request.metadata,
      },
    );

    try {
      const sendResult = await adapter.sendOutbound({ companyChannel }, formatted);
      const updated = await this.deliveryEngine.markSent(
        delivery.id,
        sendResult.externalMessageId,
        sendResult.providerResponse,
      );

      await this.sessionRepository.touchOutbound(request.channelSessionId);

      return {
        deliveryEventId: updated.id,
        deliveryStatus: updated.delivery_status,
        externalMessageId: updated.external_message_id ?? undefined,
      };
    } catch (error) {
      await this.deliveryEngine.markFailed(
        delivery.id,
        error instanceof Error ? error.message : "Outbound delivery failed",
      );
      throw error;
    }
  }

  private assertDispatchPermission(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.dispatch);
    }
    if (!ctx.hasPermission(CHANNEL_PLATFORM_PERMISSIONS.dispatch)) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.dispatch);
    }
  }
}
