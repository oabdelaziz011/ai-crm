import { randomUUID } from "@workspace/platform-crypto";
import type { ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelDispatcherPort, ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type {
  ChannelInboundEventRepository,
  ChannelSessionRepository,
} from "../repositories/channel-platform-repositories.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import {
  CompanyChannelNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ResolvedCompanyChannel, ServiceContext } from "../types.js";
import { ChannelSessionEngine } from "../engines/channel-session-engine.js";
import type { InboundRouteRequestDto, InboundRouteResponseDto } from "../dto/channel-dto.js";

export class InboundMessagePipeline {
  constructor(
    private readonly ports: ChannelPlatformPorts,
    private readonly adapterRegistry: ChannelAdapterRegistryPort,
    private readonly sessionEngine: ChannelSessionEngine,
    private readonly dispatcher: ChannelDispatcherPort,
    private readonly inboundRepository: ChannelInboundEventRepository,
    private readonly sessionRepository: ChannelSessionRepository,
  ) {}

  async process(ctx: ServiceContext, request: InboundRouteRequestDto): Promise<InboundRouteResponseDto> {
    this.assertRoutePermission(ctx, request.companyId);

    const companyChannel = await this.resolveCompanyChannel(request.companyChannelId, request.companyId);
    const adapter = this.adapterRegistry.require(request.channelKey);
    const idempotencyKey = request.idempotencyKey ?? randomUUID();

    const duplicate = await this.inboundRepository.findByIdempotencyKey(
      request.companyChannelId,
      idempotencyKey,
    );
    if (duplicate?.processing_status === "processed") {
      return {
        inboundEventId: duplicate.id,
        conversationId: duplicate.conversation_id ?? request.conversationId ?? "",
        channelSessionId: duplicate.channel_session_id ?? "",
        incomingMessageId: duplicate.incoming_message_id ?? "",
        runtimeExecutionId: duplicate.runtime_execution_id ?? undefined,
        duplicate: true,
      };
    }

    const inboundEvent = duplicate
      ? duplicate
      : await this.inboundRepository.createEvent({
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          idempotencyKey,
          externalThreadId: request.externalThreadId,
          externalMessageId: request.externalMessageId,
          senderExternalId: request.senderExternalId,
          payload: request.payload,
        });

    await this.inboundRepository.updateEvent({
      inboundEventId: inboundEvent.id,
      processingStatus: "processing",
    });

    try {
      const normalized = adapter.normalizeInbound({ companyChannel }, request.payload);
      if (!normalized.text.trim()) {
        throw new ValidationError("Inbound message text is required.");
      }

      const session = await this.sessionEngine.resolveSession(ctx, {
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        externalThreadId: normalized.externalThreadId,
        senderExternalId: normalized.senderExternalId,
        conversationId: request.conversationId,
        aiAssistantId: request.aiAssistantId,
        metadata: normalized.metadata,
      });

      await this.sessionRepository.touchInbound(session.id);

      let incomingMessageId: string | undefined;

      if (!request.executeAi) {
        const incomingMessage = await this.ports.conversation.addIncomingMessage({
          conversationId: session.conversation_id,
          content: normalized.text,
          externalMessageId: normalized.externalMessageId,
          metadata: {
            channelKey: request.channelKey,
            source: request.source,
            attachments: normalized.attachments,
            ...(normalized.metadata ?? {}),
          },
        });
        incomingMessageId = incomingMessage.id;
      }

      let runtimeExecutionId: string | undefined;
      let outboundDeliveryId: string | undefined;
      let responseContent: string | undefined;

      if (request.executeAi) {
        if (!request.runtimeConfig?.providerConnectionId) {
          throw new ValidationError("runtimeConfig.providerConnectionId is required when executeAi is true.");
        }

        const runtimeResult = await this.ports.runtime.execute({
          companyId: request.companyId,
          conversationId: session.conversation_id,
          messageText: normalized.text,
          runtimeConfig: request.runtimeConfig,
          correlationId: inboundEvent.id,
          onStreamChunk: request.onStreamChunk,
          abortSignal: request.abortSignal,
        });

        runtimeExecutionId = runtimeResult.executionId;
        responseContent = runtimeResult.responseContent;

        const outbound = await this.dispatcher.dispatch(ctx, {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          externalThreadId: normalized.externalThreadId,
          text: responseContent,
          metadata: {
            runtimeExecutionId,
            correlationId: runtimeResult.correlationId,
          },
          persistConversationMessage: false,
        });

        outboundDeliveryId = outbound.deliveryEventId;
      }

      await this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "processed",
        conversationId: session.conversation_id,
        channelSessionId: session.id,
        incomingMessageId,
        runtimeExecutionId,
        processedAt: new Date().toISOString(),
      });

      return {
        inboundEventId: inboundEvent.id,
        conversationId: session.conversation_id,
        channelSessionId: session.id,
        incomingMessageId: incomingMessageId ?? "",
        runtimeExecutionId,
        outboundDeliveryId,
        responseContent,
      };
    } catch (error) {
      await this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Inbound pipeline failed",
        processedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private assertRoutePermission(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
    if (!ctx.hasPermission(CHANNEL_PLATFORM_PERMISSIONS.route)) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
  }

  private async resolveCompanyChannel(
    companyChannelId: string,
    companyId: string,
  ): Promise<ResolvedCompanyChannel> {
    const companyChannel = await this.ports.registry.getCompanyChannel(companyChannelId);
    if (!companyChannel || companyChannel.companyId !== companyId) {
      throw new CompanyChannelNotFoundError(companyChannelId);
    }
    if (!companyChannel.isEnabled) {
      throw new ValidationError("Company channel must be enabled.");
    }
    return companyChannel;
  }
}
