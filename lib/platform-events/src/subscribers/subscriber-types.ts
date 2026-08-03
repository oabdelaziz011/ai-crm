import type { PlatformEvent, PlatformEventType } from "../types/event-types.js";
import type { PlatformEventEnvelope } from "../types/envelope.js";

export type PlatformEventHandler = (envelope: PlatformEvent) => Promise<void>;

export interface PlatformEventSubscriber {
  readonly subscriberId: string;
  readonly subscribedEvents: PlatformEventType[] | "*";
  handle(envelope: PlatformEvent): Promise<void>;
}

export function subscriberMatchesEvent(
  subscriber: PlatformEventSubscriber,
  eventType: PlatformEventType,
): boolean {
  if (subscriber.subscribedEvents === "*") return true;
  return subscriber.subscribedEvents.includes(eventType);
}

export type SubscriberDispatchResult = {
  subscriberId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
};

export type EventBusPublishRecord = {
  envelope: PlatformEventEnvelope<string, unknown>;
  dispatchResults: SubscriberDispatchResult[];
  publishedAt: string;
};
