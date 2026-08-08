import { randomUUID } from "@workspace/platform-crypto";
import type { ChannelAdapterPort, ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelTelemetryPort } from "../ports/telemetry-port.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { InboundRouteRequestDto, InboundRouteResponseDto, WebhookEnvelopeDto } from "../dto/channel-dto.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { ServiceContext } from "../types.js";
import { InboundMessagePipeline } from "../pipelines/inbound-message-pipeline.js";
import {
  DeliveryStatusPipeline,
  type DeliveryStatusProcessResponse,
} from "../pipelines/delivery-status-pipeline.js";
import {
  buildWebhookAdapterClassificationLog,
  logWebhookAdapterClassification,
} from "../debug/webhook-adapter-classification.js";
import { waTraceOnDeliveryStatus } from "../debug/whatsapp-conversation-trace-bridge.js";
import { assertWebhookCompanyChannel } from "../webhooks/webhook-channel-guards.js";

export type WebhookRouteSingleResponse =
  | { kind: "inbound"; result: InboundRouteResponseDto }
  | { kind: "delivery_status"; result: DeliveryStatusProcessResponse }
  | { kind: "ignored"; reason: string; idempotencyKey?: string };

export type WebhookRouteResponse =
  | WebhookRouteSingleResponse
  | {
      kind: "batch";
      results: WebhookRouteSingleResponse[];
      primary?: InboundRouteResponseDto;
    };

function resolveWebhookEnvelopes(
  adapter: ChannelAdapterPort,
  ctx: Parameters<NonNullable<ChannelAdapterPort["parseWebhook"]>>[0],
  rawPayload: Record<string, unknown>,
): WebhookEnvelopeDto[] {
  if (adapter.parseWebhookEvents) {
    return adapter.parseWebhookEvents(ctx, rawPayload);
  }

  if (adapter.parseWebhook) {
    return [adapter.parseWebhook(ctx, rawPayload)];
  }

  throw new ValidationError(`Channel adapter ${adapter.channelKey} does not support webhooks.`);
}

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
      aiEmployeeId?: string;
      employeeConversationMetadata?: Record<string, unknown>;
      trace?: InboundRouteRequestDto["trace"];
      requestId?: string | null;
    },
  ): Promise<WebhookRouteResponse> {
    const companyChannel = await this.ports.registry.getCompanyChannel(request.companyChannelId);
    assertWebhookCompanyChannel(companyChannel, request.channelKey);

    const adapter = this.adapterRegistry.require(request.channelKey);
    let envelopes: WebhookEnvelopeDto[];

    try {
      envelopes = resolveWebhookEnvelopes(adapter, { companyChannel }, request.rawPayload);
    } catch (error) {
      request.trace?.step("webhook.diag", {
        stage: "router.adapter_parse_failed",
        error: error instanceof Error ? error.message : "adapter_parse_failed",
      });
      throw error;
    }

    if (envelopes.length === 0) {
      throw new ValidationError(`${request.channelKey} webhook payload did not contain routable events.`);
    }

    request.trace?.step("webhook.adapter_parsed", {
      parsedEventCount: envelopes.length,
      eventTypes: envelopes.map((envelope) => envelope.eventType),
    });

    const results: WebhookRouteSingleResponse[] = [];
    let primaryInbound: InboundRouteResponseDto | undefined;

    for (const envelope of envelopes) {
      const adapterClassification = buildWebhookAdapterClassificationLog({
        channelKey: request.channelKey,
        requestId: request.requestId ?? null,
        envelope,
        parsedEventCount: envelopes.length,
      });
      logWebhookAdapterClassification(adapterClassification);
      request.trace?.step("webhook.diag", adapterClassification);

      if (envelope.eventType === "message.status" || envelope.eventType === "message.read") {
        request.trace?.step("webhook.diag", {
          stage: "router.delivery_status_only",
          eventType: envelope.eventType,
          externalMessageId: envelope.externalMessageId ?? null,
        });

        const status =
          envelope.eventType === "message.read"
            ? "read"
            : (envelope.payload.deliveryStatus as "sent" | "delivered" | "read" | "failed");

        const result = await this.deliveryStatusPipeline.process(ctx, {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          externalMessageId: envelope.externalMessageId ?? "",
          status,
          providerResponse:
            typeof envelope.payload.providerResponse === "object" && envelope.payload.providerResponse
              ? (envelope.payload.providerResponse as Record<string, unknown>)
              : undefined,
          errorMessage:
            typeof envelope.payload.errorMessage === "string" ? envelope.payload.errorMessage : undefined,
        });

        // Observability only: correlate delivery/read back to the inbound TRACE.
        waTraceOnDeliveryStatus(envelope.externalMessageId, status);

        await this.telemetry.recordOutboundDispatched({
          kind: "delivery_status",
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          externalMessageId: envelope.externalMessageId,
          deliveryStatus: result.deliveryStatus,
          updated: result.updated,
        });

        results.push({ kind: "delivery_status", result });
        continue;
      }

      if (envelope.eventType !== "message.received") {
        results.push({
          kind: "ignored",
          reason: `unsupported_event_type:${envelope.eventType}`,
          idempotencyKey: envelope.idempotencyKey,
        });
        continue;
      }

      const result = await this.routeInbound(ctx, {
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        source: "webhook",
        idempotencyKey: envelope.idempotencyKey || randomUUID(),
        externalThreadId: envelope.externalThreadId,
        externalMessageId: envelope.externalMessageId,
        senderExternalId:
          typeof envelope.payload.senderExternalId === "string" ? envelope.payload.senderExternalId : null,
        payload: envelope.payload,
        executeAi: request.executeAi,
        runtimeConfig: request.runtimeConfig,
        aiAssistantId: request.aiAssistantId,
        aiEmployeeId: request.aiEmployeeId,
        employeeConversationMetadata: request.employeeConversationMetadata,
        trace: request.trace,
        requestId: request.requestId ?? null,
      });

      primaryInbound = result;
      results.push({ kind: "inbound", result });
    }

    if (results.length === 1) {
      return results[0]!;
    }

    return {
      kind: "batch",
      results,
      primary: primaryInbound,
    };
  }

  private assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
  }
}
