import { DEFAULT_HANDOFF_REQUEST_TTL_MS, HANDOFF_PERMISSIONS } from "../constants.js";
import {
  createConversationAcceptedEvent,
  createConversationEscalatedEvent,
  createConversationRejectedEvent,
  createConversationReturnedToAiEvent,
  createConversationTransferredEvent,
  createOwnerChangedEvent,
  createQueueJoinedEvent,
  createQueueLeftEvent,
} from "../events/handoff-event-factory.js";
import { HandoffConflictError, HandoffNotFoundError, HandoffValidationError, QueueFullError } from "../errors.js";
import type {
  HandoffAgentResolverPort,
  HandoffAuditPort,
  HandoffContextAssemblyPort,
  HandoffConversationPort,
  HandoffEventPublisherPort,
  HandoffNotificationPort,
} from "../ports/handoff-platform-ports.js";
import type { HandoffRepository } from "../repositories/handoff-repository-port.js";
import { applyPriorityBoost, resolveEscalationRule } from "./escalation-engine.js";
import { estimateWaitTimeSeconds, isWithinBusinessHours, selectQueueAgent } from "./queue-routing-engine.js";
import type {
  ConversationOwner,
  EscalationTrigger,
  HandoffRequestRecord,
  HandoffServiceContext,
  LifecycleState,
  OwnerType,
  OwnershipRecord,
  PresenceState,
  QueuePosition,
} from "../types/handoff-types.js";
import { toConversationOwner } from "../types/handoff-types.js";
import {
  assertHandoffActor,
  assertHandoffCompanyAccess,
  assertHandoffPermission,
  readOptionalString,
  readRequiredString,
} from "../validators/handoff-guards.js";

export type HandoffCommandServiceDeps = {
  handoff: HandoffRepository;
  conversations: HandoffConversationPort;
  context: HandoffContextAssemblyPort;
  agents: HandoffAgentResolverPort;
  events: HandoffEventPublisherPort;
  notifications: HandoffNotificationPort;
  audit: HandoffAuditPort;
};

export class HandoffCommandService {
  constructor(private readonly deps: HandoffCommandServiceDeps) {}

  async transferConversation(
    ctx: HandoffServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      toUserId?: string;
      toQueueId?: string;
      reason?: string;
      requestedByAiAssistantId?: string;
    },
  ): Promise<{ ownership: ConversationOwner; request: HandoffRequestRecord | null }> {
    const actorUserId = input.requestedByAiAssistantId ? null : assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.transfer);

    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const current = await this.ensureOwnership(input.companyId, input.conversationId, conversation);
    const reason = readOptionalString(input.reason) ?? "Transfer requested";

    const contextSnapshot = await this.captureContext(input.companyId, input.conversationId, reason);

    if (input.toQueueId) {
      return this.enqueueInternal(ctx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: input.toQueueId,
        reason,
        current,
        contextSnapshotId: contextSnapshot?.id ?? null,
        actorUserId,
        requestedByAiAssistantId: input.requestedByAiAssistantId ?? null,
        requestType: "transfer",
      });
    }

    const toUserId = readRequiredString(input.toUserId, "Target agent");
    const label = await this.deps.agents.resolveAgentLabel(toUserId);

    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: "human_agent",
      ownerId: toUserId,
      ownerLabel: label,
      assignedUserId: toUserId,
      lifecycleState: "ASSIGNED",
      action: "transfer_conversation",
      reason,
      actorUserId,
      contextSnapshotId: contextSnapshot?.id ?? null,
      aiAssistantId: current.aiAssistantId,
    });

    await this.deps.conversations.assignConversation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      assignedUserId: toUserId,
      actorUserId,
    });

    await this.deps.events.publish(
      createConversationTransferredEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        fromOwnerType: current.ownerType,
        toOwnerType: "human_agent",
        toOwnerId: toUserId,
        toQueueId: null,
        actorUserId,
        reason,
      }),
    );

    await this.notifyAgent("transfer", input.companyId, input.conversationId, toUserId, actorUserId);

    return { ownership: toConversationOwner(ownership), request: null };
  }

  async acceptConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; requestId?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.accept);

    const request =
      input.requestId != null
        ? await this.requireRequest(input.companyId, input.requestId)
        : await this.deps.handoff.getPendingRequest(input.companyId, input.conversationId);

    if (!request || request.status !== "pending") {
      throw new HandoffValidationError("No pending handoff request to accept.");
    }

    const label = await this.deps.agents.resolveAgentLabel(actorUserId);
    const current = await this.deps.handoff.getOwnership(input.companyId, input.conversationId);

    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: "human_agent",
      ownerId: actorUserId,
      ownerLabel: label,
      assignedUserId: actorUserId,
      lifecycleState: "ASSIGNED",
      action: "accept_conversation",
      reason: "Accepted handoff request",
      actorUserId,
      contextSnapshotId: request.contextSnapshotId,
      aiAssistantId: current?.aiAssistantId ?? null,
      queueId: null,
    });

    await this.deps.handoff.updateRequestStatus({
      companyId: input.companyId,
      requestId: request.id,
      status: "accepted",
      acceptedByUserId: actorUserId,
    });

    await this.deps.conversations.assignConversation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      assignedUserId: actorUserId,
      actorUserId,
    });

    if (current?.queueId) {
      await this.deps.events.publish(
        createQueueLeftEvent({
          companyId: input.companyId,
          conversationId: input.conversationId,
          queueId: current.queueId,
          reason: "accepted",
        }),
      );
    }

    await this.deps.events.publish(
      createConversationAcceptedEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        requestId: request.id,
        acceptedByUserId: actorUserId,
      }),
    );

    return { ownership: toConversationOwner(ownership) };
  }

  async rejectConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; requestId?: string; reason?: string },
  ): Promise<{ request: HandoffRequestRecord }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.reject);

    const request =
      input.requestId != null
        ? await this.requireRequest(input.companyId, input.requestId)
        : await this.deps.handoff.getPendingRequest(input.companyId, input.conversationId);

    if (!request || request.status !== "pending") {
      throw new HandoffValidationError("No pending handoff request to reject.");
    }

    const updated = await this.deps.handoff.updateRequestStatus({
      companyId: input.companyId,
      requestId: request.id,
      status: "rejected",
      rejectedByUserId: actorUserId,
    });

    await this.deps.events.publish(
      createConversationRejectedEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        requestId: request.id,
        rejectedByUserId: actorUserId,
        reason: readOptionalString(input.reason) ?? "Rejected",
      }),
    );

    return { request: updated };
  }

  async returnConversationToAi(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.returnToAi);

    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const current = await this.ensureOwnership(input.companyId, input.conversationId, conversation);
    const aiAssistantId = conversation.aiAssistantId;
    if (!aiAssistantId) throw new HandoffValidationError("Conversation has no AI assistant to return to.");

    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: "ai_employee",
      ownerId: aiAssistantId,
      ownerLabel: "AI Employee",
      assignedUserId: null,
      lifecycleState: "AI_HANDLING",
      action: "return_conversation_to_ai",
      reason: readOptionalString(input.reason) ?? "Returned to AI",
      actorUserId,
      contextSnapshotId: null,
      aiAssistantId,
      queueId: null,
    });

    await this.deps.conversations.releaseConversation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      actorUserId,
    });

    await this.deps.events.publish(
      createConversationReturnedToAiEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        actorUserId,
        ownership,
      }),
    );

    return { ownership: toConversationOwner(ownership) };
  }

  async assignConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; assigneeUserId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.assign);

    const assigneeUserId = readRequiredString(input.assigneeUserId, "Assignee");
    const label = await this.deps.agents.resolveAgentLabel(assigneeUserId);
    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const current = await this.ensureOwnership(input.companyId, input.conversationId, conversation);

    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: "human_agent",
      ownerId: assigneeUserId,
      ownerLabel: label,
      assignedUserId: assigneeUserId,
      lifecycleState: "ASSIGNED",
      action: "assign_conversation",
      reason: readOptionalString(input.reason) ?? "Assigned",
      actorUserId,
      contextSnapshotId: null,
      aiAssistantId: current.aiAssistantId,
      queueId: null,
    });

    await this.deps.conversations.assignConversation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      assignedUserId: assigneeUserId,
      actorUserId,
    });

    await this.notifyAgent("assignment", input.companyId, input.conversationId, assigneeUserId, actorUserId);
    return { ownership: toConversationOwner(ownership) };
  }

  async reassignConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; assigneeUserId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    return this.assignConversation(ctx, {
      ...input,
      reason: readOptionalString(input.reason) ?? "Reassigned",
    });
  }

  async queueConversation(
    ctx: HandoffServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      queueId: string;
      reason?: string;
      requestedByAiAssistantId?: string;
    },
  ): Promise<{ ownership: ConversationOwner; request: HandoffRequestRecord; queuePosition: QueuePosition }> {
    const actorUserId = input.requestedByAiAssistantId ? null : assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.queue);

    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const current = await this.ensureOwnership(input.companyId, input.conversationId, conversation);
    const reason = readOptionalString(input.reason) ?? "Queued for human agent";
    const contextSnapshot = await this.captureContext(input.companyId, input.conversationId, reason);

    const result = await this.enqueueInternal(ctx, {
      companyId: input.companyId,
      conversationId: input.conversationId,
      queueId: input.queueId,
      reason,
      current,
      contextSnapshotId: contextSnapshot?.id ?? null,
      actorUserId,
      requestedByAiAssistantId: input.requestedByAiAssistantId ?? null,
      requestType: "queue",
    });

    const queuePosition = await this.computeQueuePosition(
      input.companyId,
      input.conversationId,
      input.queueId,
    );

    return {
      ownership: result.ownership,
      request: result.request!,
      queuePosition,
    };
  }

  async removeFromQueue(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.queue);

    const current = await this.deps.handoff.getOwnership(input.companyId, input.conversationId);
    if (!current || current.ownerType !== "queue") {
      throw new HandoffValidationError("Conversation is not in a queue.");
    }

    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: "system",
      ownerId: null,
      ownerLabel: "Unassigned",
      assignedUserId: null,
      lifecycleState: "WAITING_QUEUE",
      action: "remove_from_queue",
      reason: readOptionalString(input.reason) ?? "Removed from queue",
      actorUserId,
      contextSnapshotId: null,
      aiAssistantId: conversation.aiAssistantId,
      queueId: null,
    });

    await this.deps.events.publish(
      createQueueLeftEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: current.queueId!,
        reason: "removed",
      }),
    );

    return { ownership: toConversationOwner(ownership) };
  }

  async pauseConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.transfer);

    const current = await this.requireOwnership(input.companyId, input.conversationId);
    if (current.isPaused) throw new HandoffConflictError("Conversation is already paused.");

    const ownership = await this.deps.handoff.upsertOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      ownerType: current.ownerType,
      ownerId: current.ownerId,
      ownerLabel: current.ownerLabel,
      queueId: current.queueId,
      lifecycleState: "PAUSED",
      assignedUserId: current.assignedUserId,
      aiAssistantId: current.aiAssistantId,
      isPaused: true,
      pausedAt: new Date().toISOString(),
      pausedReason: readOptionalString(input.reason) ?? "Paused",
      metadata: current.metadata,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "handoff_ownership", ownership.id, {
      action: "pause",
    });

    return { ownership: toConversationOwner(ownership) };
  }

  async resumeConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.transfer);

    const current = await this.requireOwnership(input.companyId, input.conversationId);
    if (!current.isPaused) throw new HandoffValidationError("Conversation is not paused.");

    const lifecycleState: LifecycleState =
      current.ownerType === "ai_employee"
        ? "AI_HANDLING"
        : current.ownerType === "queue"
          ? "WAITING_QUEUE"
          : "ASSIGNED";

    const ownership = await this.deps.handoff.upsertOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      ownerType: current.ownerType,
      ownerId: current.ownerId,
      ownerLabel: current.ownerLabel,
      queueId: current.queueId,
      lifecycleState,
      assignedUserId: current.assignedUserId,
      aiAssistantId: current.aiAssistantId,
      isPaused: false,
      pausedAt: null,
      pausedReason: null,
      metadata: current.metadata,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "handoff_ownership", ownership.id, {
      action: "resume",
    });

    return { ownership: toConversationOwner(ownership) };
  }

  async closeConversation(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; reason?: string },
  ): Promise<{ ownership: ConversationOwner }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.transfer);

    const current = await this.requireOwnership(input.companyId, input.conversationId);
    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: current,
      ownerType: current.ownerType,
      ownerId: current.ownerId,
      ownerLabel: current.ownerLabel,
      assignedUserId: current.assignedUserId,
      lifecycleState: "CLOSED",
      action: "close_conversation",
      reason: readOptionalString(input.reason) ?? "Closed",
      actorUserId,
      contextSnapshotId: null,
      aiAssistantId: current.aiAssistantId,
      queueId: current.queueId,
    });

    await this.deps.conversations.closeConversation({
      companyId: input.companyId,
      conversationId: input.conversationId,
      actorUserId,
    });

    return { ownership: toConversationOwner(ownership) };
  }

  async escalateConversation(
    ctx: HandoffServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      triggerCode: EscalationTrigger;
      reason?: string;
      targetQueueId?: string;
      requestedByAiAssistantId?: string;
    },
  ): Promise<{ ownership: ConversationOwner; request: HandoffRequestRecord }> {
    const actorUserId = input.requestedByAiAssistantId ? null : assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.escalate);

    const conversation = await this.requireConversation(input.companyId, input.conversationId);
    const current = await this.ensureOwnership(input.companyId, input.conversationId, conversation);
    const rules = await this.deps.handoff.listEscalationRules(input.companyId, true);
    const rule = resolveEscalationRule({ triggerCode: input.triggerCode, rules });
    const targetQueueId = input.targetQueueId ?? rule?.targetQueueId ?? null;
    const reason = readOptionalString(input.reason) ?? `Escalation: ${input.triggerCode}`;

    const contextSnapshot = await this.captureContext(
      input.companyId,
      input.conversationId,
      reason,
      { escalationTrigger: input.triggerCode },
    );

    const request = await this.deps.handoff.createRequest({
      companyId: input.companyId,
      conversationId: input.conversationId,
      requestType: "escalation",
      fromOwnerType: current.ownerType,
      fromOwnerId: current.ownerId,
      toOwnerType: targetQueueId ? "queue" : "human_agent",
      toOwnerId: null,
      toQueueId: targetQueueId,
      reason,
      escalationReasonCode: input.triggerCode,
      priority: applyPriorityBoost(conversation.priority, rule?.priorityBoost ?? "normal"),
      contextSnapshotId: contextSnapshot?.id ?? null,
      requestedByUserId: actorUserId,
      requestedByAiAssistantId: input.requestedByAiAssistantId ?? null,
      expiresAt: new Date(Date.now() + DEFAULT_HANDOFF_REQUEST_TTL_MS).toISOString(),
    });

    let ownership: OwnershipRecord;
    if (targetQueueId) {
      const queued = await this.enqueueInternal(ctx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: targetQueueId,
        reason,
        current,
        contextSnapshotId: contextSnapshot?.id ?? null,
        actorUserId,
        requestedByAiAssistantId: input.requestedByAiAssistantId ?? null,
        requestType: "escalation",
        skipRequestCreation: true,
      });
      ownership = await this.deps.handoff.getOwnership(input.companyId, input.conversationId) as OwnershipRecord;
      void queued;
    } else {
      ownership = await this.transitionOwnership({
        companyId: input.companyId,
        conversationId: input.conversationId,
        previous: current,
        ownerType: current.ownerType,
        ownerId: current.ownerId,
        ownerLabel: current.ownerLabel,
        assignedUserId: current.assignedUserId,
        lifecycleState: "ESCALATED",
        action: "escalate_conversation",
        reason,
        actorUserId,
        contextSnapshotId: contextSnapshot?.id ?? null,
        aiAssistantId: current.aiAssistantId,
        queueId: current.queueId,
      });
    }

    await this.deps.events.publish(
      createConversationEscalatedEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        escalationReasonCode: input.triggerCode,
        targetQueueId,
        actorUserId,
        request,
      }),
    );

    await this.deps.notifications.notify({
      kind: "escalation",
      companyId: input.companyId,
      conversationId: input.conversationId,
      actorUserId,
      queueId: targetQueueId,
      metadata: { triggerCode: input.triggerCode },
    });

    return { ownership: toConversationOwner(ownership), request };
  }

  async updatePresence(
    ctx: HandoffServiceContext,
    input: {
      companyId: string;
      state: PresenceState;
      viewingConversationId?: string;
    },
  ): Promise<{ presence: import("../types/handoff-types.js").AgentPresenceRecord }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.presence);

    const presence = await this.deps.handoff.upsertPresence({
      companyId: input.companyId,
      userId: actorUserId,
      state: input.state,
      viewingConversationId: input.viewingConversationId ?? null,
      lastHeartbeatAt: new Date().toISOString(),
    });

    return { presence };
  }

  async heartbeatPresence(
    ctx: HandoffServiceContext,
    input: { companyId: string; viewingConversationId?: string },
  ): Promise<{ presence: import("../types/handoff-types.js").AgentPresenceRecord }> {
    const actorUserId = assertHandoffActor(ctx);
    assertHandoffCompanyAccess(ctx, input.companyId);
    const existing = await this.deps.handoff.getPresence(input.companyId, actorUserId);
    const state = existing?.state ?? "online";
    return this.updatePresence(ctx, {
      companyId: input.companyId,
      state: state === "offline" ? "online" : state,
      viewingConversationId: input.viewingConversationId,
    });
  }

  async routeNextInQueue(
    ctx: HandoffServiceContext,
    input: { companyId: string; queueId: string },
  ): Promise<{ assigned: boolean; assigneeUserId?: string; conversationId?: string }> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.manage);

    const queue = await this.deps.handoff.getQueue(input.companyId, input.queueId);
    if (!queue) throw new HandoffNotFoundError("Queue", input.queueId);
    if (!isWithinBusinessHours(queue.businessHours)) return { assigned: false };

    const pending = await this.deps.handoff.listPendingRequests({
      companyId: input.companyId,
      queueId: input.queueId,
      limit: 1,
    });
    if (!pending.length) return { assigned: false };

    const members = await this.deps.handoff.listQueueMembers(input.companyId, input.queueId);
    const presence = await this.deps.handoff.listPresence(input.companyId, ["online"]);
    const presenceByUserId = new Map(presence.map((row) => [row.userId, row]));
    const agent = selectQueueAgent({ queue, members, presenceByUserId });
    if (!agent) return { assigned: false };

    const request = pending[0];
    await this.assignConversation(ctx, {
      companyId: input.companyId,
      conversationId: request.conversationId,
      assigneeUserId: agent.userId,
      reason: `Auto-routed via ${queue.routingStrategy}`,
    });
    await this.deps.handoff.incrementMemberAssignment(input.queueId, agent.userId);
    await this.deps.handoff.updateRequestStatus({
      companyId: input.companyId,
      requestId: request.id,
      status: "accepted",
      acceptedByUserId: agent.userId,
    });

    return {
      assigned: true,
      assigneeUserId: agent.userId,
      conversationId: request.conversationId,
    };
  }

  private async enqueueInternal(
    _ctx: HandoffServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      queueId: string;
      reason: string;
      current: OwnershipRecord;
      contextSnapshotId: string | null;
      actorUserId: string | null;
      requestedByAiAssistantId: string | null;
      requestType: "transfer" | "queue" | "escalation";
      skipRequestCreation?: boolean;
    },
  ): Promise<{ ownership: ConversationOwner; request: HandoffRequestRecord | null }> {
    const queue = await this.deps.handoff.getQueue(input.companyId, input.queueId);
    if (!queue) throw new HandoffNotFoundError("Queue", input.queueId);

    const waitingCount = await this.deps.handoff.countQueueWaiting(input.companyId, input.queueId);
    if (waitingCount >= queue.maxQueueSize) {
      if (queue.overflowQueueId) {
        return this.enqueueInternal(_ctx, { ...input, queueId: queue.overflowQueueId });
      }
      throw new QueueFullError(input.queueId);
    }

    const ownership = await this.transitionOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previous: input.current,
      ownerType: "queue",
      ownerId: input.queueId,
      ownerLabel: queue.name,
      assignedUserId: null,
      lifecycleState: "WAITING_QUEUE",
      action: "queue_conversation",
      reason: input.reason,
      actorUserId: input.actorUserId,
      contextSnapshotId: input.contextSnapshotId,
      aiAssistantId: input.current.aiAssistantId,
      queueId: input.queueId,
    });

    const request = input.skipRequestCreation
      ? null
      : await this.deps.handoff.createRequest({
          companyId: input.companyId,
          conversationId: input.conversationId,
          requestType: input.requestType,
          fromOwnerType: input.current.ownerType,
          fromOwnerId: input.current.ownerId,
          toOwnerType: "queue",
          toOwnerId: input.queueId,
          toQueueId: input.queueId,
          reason: input.reason,
          contextSnapshotId: input.contextSnapshotId,
          requestedByUserId: input.actorUserId,
          requestedByAiAssistantId: input.requestedByAiAssistantId,
          expiresAt: new Date(Date.now() + DEFAULT_HANDOFF_REQUEST_TTL_MS).toISOString(),
        });

    const position = waitingCount + 1;
    await this.deps.events.publish(
      createQueueJoinedEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: input.queueId,
        queueName: queue.name,
        position,
      }),
    );

    return { ownership: toConversationOwner(ownership), request };
  }

  private async transitionOwnership(input: {
    companyId: string;
    conversationId: string;
    previous: OwnershipRecord | null;
    ownerType: OwnerType;
    ownerId: string | null;
    ownerLabel: string;
    assignedUserId: string | null;
    lifecycleState: LifecycleState;
    action: string;
    reason: string;
    actorUserId: string | null;
    contextSnapshotId: string | null;
    aiAssistantId: string | null;
    queueId?: string | null;
  }): Promise<OwnershipRecord> {
    const ownership = await this.deps.handoff.upsertOwnership({
      companyId: input.companyId,
      conversationId: input.conversationId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ownerLabel: input.ownerLabel,
      queueId: input.queueId ?? null,
      lifecycleState: input.lifecycleState,
      assignedUserId: input.assignedUserId,
      aiAssistantId: input.aiAssistantId,
    });

    await this.deps.handoff.appendOwnershipHistory({
      companyId: input.companyId,
      conversationId: input.conversationId,
      previousOwnerType: input.previous?.ownerType ?? null,
      previousOwnerId: input.previous?.ownerId ?? null,
      newOwnerType: input.ownerType,
      newOwnerId: input.ownerId,
      transitionAction: input.action,
      transitionReason: input.reason,
      actorUserId: input.actorUserId,
      contextSnapshotId: input.contextSnapshotId,
    });

    await this.deps.events.publish(
      createOwnerChangedEvent({
        companyId: input.companyId,
        conversationId: input.conversationId,
        previousOwnerType: input.previous?.ownerType ?? null,
        previousOwnerId: input.previous?.ownerId ?? null,
        newOwnerType: input.ownerType,
        newOwnerId: input.ownerId,
        action: input.action,
        actorUserId: input.actorUserId,
      }),
    );

    if (input.actorUserId) {
      await this.writeAudit(input.companyId, input.actorUserId, "UPDATE", "handoff_ownership", ownership.id, {
        action: input.action,
        reason: input.reason,
      });
    }

    return ownership;
  }

  private async ensureOwnership(
    companyId: string,
    conversationId: string,
    conversation: NonNullable<Awaited<ReturnType<HandoffConversationPort["getConversation"]>>>,
  ): Promise<OwnershipRecord> {
    const existing = await this.deps.handoff.getOwnership(companyId, conversationId);
    if (existing) return existing;

    const ownerType: OwnerType = conversation.assignedUserId
      ? "human_agent"
      : conversation.aiAssistantId
        ? "ai_employee"
        : "system";

    return this.deps.handoff.upsertOwnership({
      companyId,
      conversationId,
      ownerType,
      ownerId: conversation.assignedUserId ?? conversation.aiAssistantId,
      ownerLabel: ownerType === "ai_employee" ? "AI Employee" : ownerType === "human_agent" ? "Agent" : "System",
      lifecycleState: ownerType === "ai_employee" ? "AI_HANDLING" : ownerType === "human_agent" ? "ASSIGNED" : "NEW",
      assignedUserId: conversation.assignedUserId,
      aiAssistantId: conversation.aiAssistantId,
    });
  }

  private async requireOwnership(companyId: string, conversationId: string): Promise<OwnershipRecord> {
    const ownership = await this.deps.handoff.getOwnership(companyId, conversationId);
    if (!ownership) throw new HandoffNotFoundError("Ownership", conversationId);
    return ownership;
  }

  private async requireConversation(companyId: string, conversationId: string) {
    const conversation = await this.deps.conversations.getConversation({ companyId, conversationId });
    if (!conversation) throw new HandoffNotFoundError("Conversation", conversationId);
    return conversation;
  }

  private async requireRequest(companyId: string, requestId: string) {
    const request = await this.deps.handoff.getRequest(companyId, requestId);
    if (!request) throw new HandoffNotFoundError("HandoffRequest", requestId);
    return request;
  }

  private async captureContext(
    companyId: string,
    conversationId: string,
    reason: string,
    runtimeMetadata?: Record<string, unknown>,
  ) {
    const assembled = await this.deps.context.buildContext({
      companyId,
      conversationId,
      reasonForEscalation: reason,
      runtimeMetadata,
    });
    return this.deps.handoff.createContextSnapshot({
      companyId,
      conversationId,
      summary: assembled.summary,
      suggestedResolution: assembled.suggestedResolution,
      suggestedReply: assembled.suggestedReply,
      payload: assembled.payload,
    });
  }

  private async computeQueuePosition(
    companyId: string,
    conversationId: string,
    queueId: string,
  ): Promise<QueuePosition> {
    const queueSize = await this.deps.handoff.countQueueWaiting(companyId, queueId);
    const members = await this.deps.handoff.listQueueMembers(companyId, queueId);
    const presence = await this.deps.handoff.listPresence(companyId, ["online"]);
    const availableAgents = members.filter((member) =>
      presence.some((row) => row.userId === member.userId),
    ).length;

    return {
      queueId,
      position: queueSize,
      estimatedWaitSeconds: estimateWaitTimeSeconds(queueSize, availableAgents),
      queueSize,
    };
  }

  private async notifyAgent(
    kind: "transfer" | "assignment",
    companyId: string,
    conversationId: string,
    recipientUserId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.deps.notifications.notify({
      kind,
      companyId,
      conversationId,
      actorUserId,
      recipientUserId,
    });
  }

  private async writeAudit(
    companyId: string,
    userId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    entity: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.audit.write({ companyId, userId, action, entity, entityId, metadata });
  }
}
