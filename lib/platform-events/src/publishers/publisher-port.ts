import type { PlatformEventType, PlatformEventMap } from "../types/event-types.js";
import type { PublishContext, PublishResult } from "../types/envelope.js";

export interface PlatformEventPublisherPort {
  publish<T extends PlatformEventType>(
    eventType: T,
    payload: PlatformEventMap[T],
    context: PublishContext,
  ): Promise<PublishResult>;
}
