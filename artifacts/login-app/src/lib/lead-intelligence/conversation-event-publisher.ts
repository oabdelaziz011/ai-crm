import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createModulePublisher,
  type ConversationMessageReceivedPayload,
  type ConversationStartedPayload,
} from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";

/** Publishes conversation platform events only — never calls Lead services. */
export function publishConversationStarted(
  payload: ConversationStartedPayload,
): Promise<unknown> {
  const publisher = createModulePublisher(getLoginAppPlatformEventBus(), "conversation");
  return publisher.publish("ConversationStarted", payload, {
    tenantId: payload.companyId,
    correlationId: `${payload.conversationId}:ConversationStarted:${payload.createdAt}`,
    actorId: payload.actorUserId ?? undefined,
    actorType: payload.actorUserId ? "user" : "system",
    sourceModule: "conversation",
    entityType: "conversation",
    entityId: payload.conversationId,
    occurredAt: payload.createdAt,
  });
}

export function publishConversationMessageReceived(
  payload: ConversationMessageReceivedPayload,
): Promise<unknown> {
  const publisher = createModulePublisher(getLoginAppPlatformEventBus(), "conversation");
  return publisher.publish("ConversationMessageReceived", payload, {
    tenantId: payload.companyId,
    correlationId: `${payload.messageId}:ConversationMessageReceived:${payload.receivedAt}`,
    actorId: payload.actorUserId ?? undefined,
    actorType: "system",
    sourceModule: "conversation",
    entityType: "conversation",
    entityId: payload.conversationId,
    occurredAt: payload.receivedAt,
  });
}

/** Api-server variant with explicit client/bus injection if needed later. */
export function createConversationEventPublisher(_client?: SupabaseClient) {
  return {
    publishConversationStarted,
    publishConversationMessageReceived,
  };
}
