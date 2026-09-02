import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffPlatformServices,
  createNoopHandoffEventPublisher,
  createNoopHandoffNotificationPort,
  createSupabaseHandoffAuditPort,
  HANDOFF_PERMISSIONS,
  type HandoffPlatformServices,
  type HandoffServiceContext,
} from "@workspace/human-handoff-platform";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import type {
  HandoffServicePort,
  RequestCustomerHandoffInput,
  RequestCustomerHandoffResult,
} from "@workspace/automation-platform";
import { createLoginAppHandoffConversationPort } from "@login-app/lib/human-handoff-platform/handoff-conversation-port-adapter.js";
import {
  createLoginAppHandoffAgentResolverPort,
  createLoginAppHandoffContextAssemblyPort,
} from "@login-app/lib/human-handoff-platform/handoff-context-assembly-adapter.js";

const WEBHOOK_HANDOFF_PERMISSIONS = new Set<string>([
  HANDOFF_PERMISSIONS.view,
  HANDOFF_PERMISSIONS.transfer,
  HANDOFF_PERMISSIONS.assign,
  HANDOFF_PERMISSIONS.queue,
  HANDOFF_PERMISSIONS.escalate,
  HANDOFF_PERMISSIONS.manage,
]);

export type WebhookHandoffPlatform = {
  platform: HandoffPlatformServices;
  handoffService: HandoffServicePort;
};

function buildWebhookHandoffServiceContext(
  companyId: string,
  userId: string | null,
): HandoffServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => WEBHOOK_HANDOFF_PERMISSIONS.has(code),
  };
}

/**
 * Webhook-safe handoff platform: real conversation sync + service-role writes.
 * Skips login-app event/notification bridges (publishable client / browser deps /
 * "permission denied for function current_company_id").
 */
export function createWebhookSafeHandoffPlatform(client: SupabaseClient): HandoffPlatformServices {
  return createHandoffPlatformServices(client, {
    conversations: createLoginAppHandoffConversationPort(client),
    context: createLoginAppHandoffContextAssemblyPort(client),
    agents: createLoginAppHandoffAgentResolverPort(client),
    events: createNoopHandoffEventPublisher(),
    notifications: createNoopHandoffNotificationPort(),
    audit: createSupabaseHandoffAuditPort(client),
  });
}

export function createWebhookHandoffPlatformServices(
  client: SupabaseClient,
  options: {
    platform?: HandoffPlatformServices;
    resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
  } = {},
): WebhookHandoffPlatform {
  const platform = options.platform ?? createWebhookSafeHandoffPlatform(client);
  const resolveActor =
    options.resolveActorUserIdForCompany ??
    ((companyId: string) => resolveCompanyActorUserId(client, companyId));

  const handoffService: HandoffServicePort = {
    async requestCustomerHandoff(input: RequestCustomerHandoffInput): Promise<RequestCustomerHandoffResult> {
      const actorUserId = await resolveActor(input.companyId);
      const ctx = buildWebhookHandoffServiceContext(input.companyId, actorUserId);
      const result = await platform.commands.requestCustomerHandoff(ctx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        triggerCode: input.triggerCode,
        queueId: input.queueId,
        reason: input.reason,
        requestedByAiAssistantId: input.aiAssistantId ?? undefined,
      });

      return {
        ownership: {
          ownerType: result.ownership.ownerType,
          ownerLabel: result.ownership.ownerLabel,
          assignedUserId: result.ownership.assignedUserId ?? null,
          queueId: result.ownership.queueId ?? null,
          lifecycleState: result.ownership.lifecycleState ?? null,
        },
        assigned: result.assigned,
        queued: result.queued,
        assigneeUserId: result.assigneeUserId,
        queueId: result.queueId,
        idempotent: result.idempotent,
      };
    },
  };

  return { platform, handoffService };
}

/** Full platform for AI Employee handoff tools in webhook runtime. */
export function createWebhookHandoffPlatformForTools(client: SupabaseClient): HandoffPlatformServices {
  return createWebhookSafeHandoffPlatform(client);
}
