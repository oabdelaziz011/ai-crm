import { randomUUID } from "@workspace/platform-crypto";
import type { ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelTelemetryPort } from "../ports/telemetry-port.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { InboundRouteRequestDto, InboundRouteResponseDto } from "../dto/channel-dto.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { ServiceContext } from "../types.js";
import { InboundMessagePipeline } from "../pipelines/inbound-message-pipeline.js";
import {
  DeliveryStatusPipeline,
  type DeliveryStatusProcessResponse,
} from "../pipelines/delivery-status-pipeline.js";

export type WebhookRouteResponse =
  | { kind: "inbound"; result: InboundRouteResponseDto }
  | { kind: "delivery_status"; result: DeliveryStatusProcessResponse };

export class ChannelRouter {
  constructor(
    private readonly inboundPipeline: InboundMessagePipeline,
    private readonly deliveryStatusPipeline: DeliveryStatusPipeline,
    private readonly adapterRegistry: ChannelAdapterRegistryPort,
    private readonly ports: ChannelPlatformPorts,
    private readonly telemetry: ChannelTelemetryPort,
  ) {}

  async routeInbound(ctx: ServiceContext, request: InboundRouteRequestDto): Promise<InboundRouteResponseDto> {
    this.assertCompanyAccess(ctx, request.companyId);

    const response = await this.inboundPipeline.process(ctx, request);

    await this.telemetry.recordInboundRouted({
      inboundEventId: response.inboundEventId,
      companyId: request.companyId,
      companyChannelId: request.companyChannelId,
      channelKey: request.channelKey,
      conversationId: response.conversationId,
      duplicate: response.duplicate ?? false,
    });

    return response;
  }

  async routeWebhook(
    ctx: ServiceContext,
    request: {
      companyId: string;
      companyChannelId: string;
      channelKey: string;
      rawPayload: Record<string, unknown>;
      executeAi?: boolean;
      runtimeConfig?: InboundRouteRequestDto["runtimeConfig"];
      aiAssistantId?: string;
    },
  ): Promise<WebhookRouteResponse> {
    const companyChannel = await this.ports.registry.getCompanyChannel(request.companyChannelId);
    if (!companyChannel) {
      throw new ValidationError("Company channel not found for webhook routing.");
    }

    const adapter = this.adapterRegistry.require(request.channelKey);
    if (!adapter.parseWebhook) {
      throw new ValidationError(`Channel adapter ${request.channelKey} does not support webhooks.`);
    }

    const envelope = adapter.parseWebhook({ companyChannel }, request.rawPayload);

    if (envelope.eventType === "message.status" || envelope.eventType === "message.read") {
      const status = envelope.eventType === "message.read" ? "read" : (envelope.payload.deliveryStatus as "sent" | "delivered" | "read" | "failed");
      const result = await this.deliveryStatusPipeline.process(ctx, {
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        externalMessageId: envelope.externalMessageId ?? "",
        status,
        providerResponse:
          typeof envelope.payload.providerResponse === "object" && envelope.payload.providerResponse
            ? (envelope.payload.providerResponse as Record<string, unknown>)
            : undefined,
        errorMessage: typeof envelope.payload.errorMessage === "string" ? envelope.payload.errorMessage : undefined,
      });

      await this.telemetry.recordOutboundDispatched({
        kind: "delivery_status",
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        externalMessageId: envelope.externalMessageId,
        deliveryStatus: result.deliveryStatus,
        updated: result.updated,
      });

      return { kind: "delivery_status", result };
    }

    const result = await this.routeInbound(ctx, {
      companyId: request.companyId,
      companyChannelId: request.companyChannelId,
      channelKey: request.channelKey,
      source: "webhook",
      idempotencyKey: envelope.idempotencyKey || randomUUID(),
      externalThreadId: envelope.externalThreadId,
      externalMessageId: envelope.externalMessageId,
      senderExternalId: typeof envelope.payload.senderExternalId === "string" ? envelope.payload.senderExternalId : null,
      payload: envelope.payload,
      executeAi: request.executeAi,
      runtimeConfig: request.runtimeConfig,
      aiAssistantId: request.aiAssistantId,
    });

    return { kind: "inbound", result };
  }

  private assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
  }
}
