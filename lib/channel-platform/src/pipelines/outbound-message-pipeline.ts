import type { ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { OutboundDispatchRequestDto, OutboundDispatchResponseDto } from "../dto/channel-dto.js";
import type { ChannelSessionRepository } from "../repositories/channel-platform-repositories.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import { CompanyChannelNotFoundError, PermissionDeniedError, ValidationError } from "../errors.js";
import type { ServiceContext } from "../types.js";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { traceOutboundValidationEnter, traceOutboundValidationFail, traceOutboundValidationPass } from "../debug/omni-outbound-400-bridge.js";
import { traceMetaGraphOutboundStage } from "../debug/meta-graph-outbound-audit.js";

export class OutboundMessagePipeline {
  constructor(
    private readonly ports: ChannelPlatformPorts,
    private readonly adapterRegistry: ChannelAdapterRegistryPort,
    private readonly deliveryEngine: DeliveryTrackingEngine,
    private readonly sessionRepository: ChannelSessionRepository,
  ) {}

  async process(ctx: ServiceContext, request: OutboundDispatchRequestDto): Promise<OutboundDispatchResponseDto> {
    traceMetaGraphOutboundStage({
      stage: "OutboundMessagePipeline.process.enter",
      layer: "dispatcher.pipeline",
      file: "outbound-message-pipeline.ts",
      function: "process",
      line: 19,
      extra: {
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        conversationId: request.conversationId,
      },
    });

    traceOutboundValidationEnter({
      validationName: "OutboundMessagePipeline.process",
      layer: "dispatcher.pipeline",
      file: "outbound-message-pipeline.ts",
      function: "process",
      line: 19,
      requestPayload: request,
    });

    traceOutboundValidationEnter({
      validationName: "assertDispatchPermission",
      layer: "dispatcher.pipeline",
      file: "outbound-message-pipeline.ts",
      function: "assertDispatchPermission",
      line: 28,
      requestPayload: { companyId: request.companyId, userId: ctx.userId },
    });
    this.assertDispatchPermission(ctx, request.companyId);
    traceOutboundValidationPass("assertDispatchPermission");

    const companyChannel = await this.ports.registry.getCompanyChannel(request.companyChannelId);
    traceOutboundValidationEnter({
      validationName: "companyChannel.exists",
      layer: "dispatcher.pipeline",
      file: "outbound-message-pipeline.ts",
      function: "process",
      line: 38,
      requestPayload: { companyChannelId: request.companyChannelId, found: Boolean(companyChannel) },
    });
    if (!companyChannel || companyChannel.companyId !== request.companyId) {
      throw new CompanyChannelNotFoundError(request.companyChannelId);
    }
    traceOutboundValidationPass("companyChannel.exists");

    const adapter = this.adapterRegistry.require(request.channelKey);
    const text = request.text.trim();
    const hasAttachments = (request.attachments?.length ?? 0) > 0;
    const hasStructuredPayload = Boolean(request.outboundPayload && typeof request.outboundPayload === "object");
    traceOutboundValidationEnter({
      validationName: "outboundPayload.textOrAttachments",
      layer: "dispatcher.pipeline",
      file: "outbound-message-pipeline.ts",
      function: "process",
      line: 52,
      requestPayload: { hasText: Boolean(text), hasAttachments, hasStructuredPayload },
    });
    if (!text && !hasAttachments && !hasStructuredPayload) {
      traceOutboundValidationFail({
        validationName: "outboundPayload.textOrAttachments",
        layer: "dispatcher.pipeline",
        file: "outbound-message-pipeline.ts",
        function: "process",
        line: 54,
        error: "Outbound message text is required.",
        responseBody: { error: "validation_error", message: "Outbound message text is required." },
        rootCause: "Empty outbound text with no attachments or structured payload",
      });
      throw new ValidationError("Outbound message text is required.");
    }
    traceOutboundValidationPass("outboundPayload.textOrAttachments");

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
        outboundPayload: request.outboundPayload ?? null,
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
        metadata: {
          ...(request.metadata ?? {}),
          outboundPayload: request.outboundPayload,
        },
      },
    );

    try {
      traceOutboundValidationEnter({
        validationName: "WhatsAppCloudAdapter.sendOutbound",
        layer: "whatsapp.provider",
        file: "outbound-message-pipeline.ts",
        function: "adapter.sendOutbound",
        line: 95,
        requestPayload: { channelKey: request.channelKey, externalThreadId: request.externalThreadId },
      });
      const sendResult = await adapter.sendOutbound({ companyChannel }, formatted);
      traceOutboundValidationPass("WhatsAppCloudAdapter.sendOutbound", {
        externalMessageId: sendResult.externalMessageId ?? null,
      });
      const updated = await this.deliveryEngine.markSent(
        delivery.id,
        sendResult.externalMessageId,
        sendResult.providerResponse,
      );

      await this.sessionRepository.touchOutbound(request.channelSessionId);

      traceOutboundValidationPass("OutboundMessagePipeline.process", {
        deliveryStatus: updated.delivery_status,
      });

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
