import type { ApplicationContext } from "../../contracts/application-context.js";
import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { InfrastructurePorts } from "../../ports/infrastructure-ports.js";
import type { HandoffEscalationTrigger } from "../../ports/handoff-ports.js";

export type HandoffCommandHandlerDeps = Readonly<{
  ports: ApplicationPorts;
  infra: InfrastructurePorts;
}>;

function eventContext(context: ApplicationContext) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    actorType: context.actorType ?? ("ai" as const),
    correlationId: context.correlationId,
  };
}

export async function handleEscalateToHuman(
  deps: HandoffCommandHandlerDeps,
  request: {
    conversationId: string;
    triggerCode: HandoffEscalationTrigger;
    reason: string;
    targetQueueId?: string;
    aiAssistantId?: string;
  },
  context: ApplicationContext,
) {
  const result = await deps.ports.handoffWrite.escalateToHuman({
    tenantId: context.tenantId,
    conversationId: request.conversationId,
    triggerCode: request.triggerCode,
    reason: request.reason,
    targetQueueId: request.targetQueueId,
    aiAssistantId: request.aiAssistantId,
    actorUserId: context.actorId,
  });

  const eventId = await deps.infra.events.publishConversationTransferred({
    conversationId: request.conversationId,
    fromOwnerType: "ai",
    toOwnerType: result.ownership.ownerType,
    reason: request.reason,
    context: eventContext(context),
  });

  return { response: result, eventIds: [eventId] };
}

export async function handleQueueForHuman(
  deps: HandoffCommandHandlerDeps,
  request: { conversationId: string; queueId: string; reason: string; aiAssistantId?: string },
  context: ApplicationContext,
) {
  const result = await deps.ports.handoffWrite.queueForHuman({
    tenantId: context.tenantId,
    conversationId: request.conversationId,
    queueId: request.queueId,
    reason: request.reason,
    aiAssistantId: request.aiAssistantId,
    actorUserId: context.actorId,
  });

  const eventId = await deps.infra.events.publishConversationTransferred({
    conversationId: request.conversationId,
    fromOwnerType: "ai",
    toOwnerType: "human_queue",
    reason: request.reason,
    context: eventContext(context),
  });

  return { response: result, eventIds: [eventId] };
}

export async function handleReturnToAi(
  deps: HandoffCommandHandlerDeps,
  request: { conversationId: string; reason: string },
  context: ApplicationContext,
) {
  const result = await deps.ports.handoffWrite.returnToAi({
    tenantId: context.tenantId,
    conversationId: request.conversationId,
    reason: request.reason,
    actorUserId: context.actorId,
  });

  const eventId = await deps.infra.events.publishConversationTransferred({
    conversationId: request.conversationId,
    fromOwnerType: "human",
    toOwnerType: result.ownership.ownerType,
    reason: request.reason,
    context: eventContext(context),
  });

  return { response: result, eventIds: [eventId] };
}
