import type { DeliveryStatusUpdateDto } from "../dto/channel-dto.js";
import type {
  ChannelDeliveryEventRepository,
  CreateDeliveryEventInput,
  UpdateDeliveryEventInput,
} from "../repositories/channel-platform-repositories.js";
import type { ChannelDeliveryEventRecord } from "../types.js";
import { ValidationError } from "../errors.js";

const DELIVERY_STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 2,
};

function isTerminalDeliveryStatus(status: string): boolean {
  return status === "delivered" || status === "failed" || status === "read";
}

/**
 * Protect terminal statuses from regression (e.g. delivered must not become sent).
 * delivered and failed are peer terminals — keep the first outcome.
 */
export function shouldApplyDeliveryStatus(current: string, next: string): boolean {
  if (current === next) return true;
  if (isTerminalDeliveryStatus(current)) {
    const currentRank = DELIVERY_STATUS_RANK[current] ?? 0;
    const nextRank = DELIVERY_STATUS_RANK[next] ?? 0;
    if (nextRank < currentRank) return false;
    if (current === "delivered" && next === "failed") return false;
    if (current === "failed" && next === "delivered") return false;
    if (current === "read") return false;
  }
  return true;
}

export class DeliveryTrackingEngine {
  constructor(private readonly deliveryRepository: ChannelDeliveryEventRepository) {}

  async createPendingDelivery(input: CreateDeliveryEventInput): Promise<ChannelDeliveryEventRecord> {
    return this.deliveryRepository.createEvent(input);
  }

  async markSent(
    deliveryEventId: string,
    externalMessageId: string,
    providerResponse?: Record<string, unknown>,
  ): Promise<ChannelDeliveryEventRecord> {
    return this.update({
      deliveryEventId,
      deliveryStatus: "sent",
      externalMessageId,
      providerResponse,
      sentAt: new Date().toISOString(),
      attemptCount: 1,
    });
  }

  async markFailed(deliveryEventId: string, errorMessage: string): Promise<ChannelDeliveryEventRecord> {
    return this.update({
      deliveryEventId,
      deliveryStatus: "failed",
      errorMessage,
      failedAt: new Date().toISOString(),
    });
  }

  async applyStatusUpdate(update: DeliveryStatusUpdateDto): Promise<ChannelDeliveryEventRecord> {
    const existing = await this.deliveryRepository.findById(update.deliveryEventId);
    if (!existing) {
      throw new ValidationError(`Delivery event not found: ${update.deliveryEventId}`);
    }

    if (!shouldApplyDeliveryStatus(existing.delivery_status, update.status)) {
      return existing;
    }

    const now = new Date().toISOString();
    const input: UpdateDeliveryEventInput = {
      deliveryEventId: update.deliveryEventId,
      deliveryStatus: update.status,
      externalMessageId: update.externalMessageId ?? existing.external_message_id,
      providerResponse: update.providerResponse ?? existing.provider_response,
      errorMessage: update.errorMessage ?? null,
    };

    if (update.status === "sent") input.sentAt = now;
    if (update.status === "delivered") input.deliveredAt = now;
    if (update.status === "read") input.readAt = now;
    if (update.status === "failed") input.failedAt = now;

    return this.update(input);
  }

  private update(input: UpdateDeliveryEventInput): Promise<ChannelDeliveryEventRecord> {
    return this.deliveryRepository.updateEvent(input);
  }
}
