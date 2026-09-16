import type { DeliveryStatusUpdateDto } from "../dto/channel-dto.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { ChannelDeliveryEventRepository } from "../repositories/channel-platform-repositories.js";
import type { ServiceContext } from "../types.js";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import {
  confirmOutgoingDeliveryWithRetry,
  type ConfirmOutgoingDeliveryFn,
} from "../services/confirm-outgoing-delivery.js";

export type DeliveryStatusProcessRequest = {
  companyId: string;
  companyChannelId: string;
  externalMessageId: string;
  status: DeliveryStatusUpdateDto["status"];
  providerResponse?: Record<string, unknown>;
  errorMessage?: string;
};

export type DeliveryStatusProcessResponse = {
  updated: boolean;
  deliveryEventId?: string;
  deliveryStatus?: string;
  reason?: string;
  conversationConfirmStatus?: "confirmed" | "failed" | "skipped";
};

export class DeliveryStatusPipeline {
  constructor(
    private readonly deliveryEngine: DeliveryTrackingEngine,
    private readonly deliveryRepository: ChannelDeliveryEventRepository,
    private readonly confirmOutgoingDelivery?: ConfirmOutgoingDeliveryFn,
  ) {}

  async process(ctx: ServiceContext, request: DeliveryStatusProcessRequest): Promise<DeliveryStatusProcessResponse> {
    this.assertPermission(ctx, request.companyId);

    if (!request.externalMessageId.trim()) {
      throw new ValidationError("externalMessageId is required for delivery status updates.");
    }

    const delivery = await this.deliveryRepository.findByExternalMessageId(
      request.companyChannelId,
      request.externalMessageId,
    );

    if (!delivery) {
      return { updated: false, reason: "delivery_not_found" };
    }

    const updated = await this.deliveryEngine.applyStatusUpdate({
      deliveryEventId: delivery.id,
      status: request.status,
      externalMessageId: request.externalMessageId,
      providerResponse: request.providerResponse,
      errorMessage: request.errorMessage,
    });

    let conversationConfirmStatus: DeliveryStatusProcessResponse["conversationConfirmStatus"] = "skipped";
    const outboundMessageId = updated.outbound_message_id?.trim();
    if (outboundMessageId && this.confirmOutgoingDelivery) {
      const confirmResult = await confirmOutgoingDeliveryWithRetry(this.confirmOutgoingDelivery, {
        messageId: outboundMessageId,
        status: updated.delivery_status,
        externalMessageId: updated.external_message_id ?? request.externalMessageId,
      }, {
        onAttemptError: (error, attempt) => {
          console.error("[OUTBOUND_CONFIRM] delivery webhook confirm failed", {
            attempt,
            outboundMessageId,
            deliveryEventId: updated.id,
            status: updated.delivery_status,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      });
      conversationConfirmStatus = confirmResult.ok ? "confirmed" : "failed";
    }

    return {
      updated: true,
      deliveryEventId: updated.id,
      deliveryStatus: updated.delivery_status,
      conversationConfirmStatus,
    };
  }

  private assertPermission(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.view);
    }
    if (!ctx.hasPermission(CHANNEL_PLATFORM_PERMISSIONS.view)) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.view);
    }
  }
}
