import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HANDOFF_WORKFLOW_EVENTS,
  createHandoffPlatformServices,
  createSupabaseHandoffAuditPort,
  type HandoffDomainEvent,
  type HandoffEventPublisherPort,
  type HandoffPlatformServices,
} from "@workspace/human-handoff-platform";
import { dispatchAutomationEvent } from "@/lib/automation";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";
import type { WebhookEventType } from "@/lib/integration/types";
import { createLoginAppHandoffAgentResolverPort } from "./handoff-context-assembly-adapter.js";
import { createLoginAppHandoffContextAssemblyPort } from "./handoff-context-assembly-adapter.js";
import { createLoginAppHandoffConversationPort } from "./handoff-conversation-port-adapter.js";
import { createHandoffNotificationBridge } from "./handoff-notification-bridge.js";

const HANDOFF_WEBHOOK_EVENT_MAP: Partial<Record<string, WebhookEventType>> = {
  conversation_transferred: "conversation.transferred",
  conversation_accepted: "conversation.accepted",
  conversation_rejected: "conversation.rejected",
  conversation_escalated: "conversation.escalated",
  conversation_returned_to_ai: "conversation.returned_to_ai",
  queue_joined: "conversation.queue_joined",
  queue_left: "conversation.queue_left",
  owner_changed: "conversation.owner_changed",
};

export function createHandoffEventBridge(): HandoffEventPublisherPort {
  return {
    async publish(event: HandoffDomainEvent): Promise<void> {
      const workflowName = HANDOFF_WORKFLOW_EVENTS[event.type];
      const payload = event.payload;

      await dispatchAutomationEvent({
        name: workflowName,
        companyId: event.companyId,
        params: {
          conversationId: event.conversationId,
          ...payload,
        },
        userId: typeof payload.actorUserId === "string" ? payload.actorUserId : undefined,
      });

      const webhookType = HANDOFF_WEBHOOK_EVENT_MAP[event.type];
      if (webhookType) {
        await getEnterpriseEventPublisher().publish({
          companyId: event.companyId,
          eventType: webhookType,
          eventId: `${event.conversationId}:${webhookType}:${event.occurredAt}`,
          payload: {
            conversationId: event.conversationId,
            eventType: event.type,
            ...payload,
          },
        });
      }
    },
  };
}

export function createLoginAppHandoffPlatformServices(
  client: SupabaseClient,
): HandoffPlatformServices {
  return createHandoffPlatformServices(client, {
    conversations: createLoginAppHandoffConversationPort(client),
    context: createLoginAppHandoffContextAssemblyPort(client),
    agents: createLoginAppHandoffAgentResolverPort(client),
    events: createHandoffEventBridge(),
    notifications: createHandoffNotificationBridge(),
    audit: createSupabaseHandoffAuditPort(client),
  });
}
