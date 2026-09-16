import {
  AssignmentGovernanceError,
  type AssignmentGovernancePort,
} from "@workspace/assignment-governance";
import type { AssignmentAuditPort } from "@workspace/assignment-audit";
import {
  CONVERSATION_CHANNEL_TYPES,
  CONVERSATION_PERMISSIONS,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATES,
} from "../constants.js";
import {
  ConversationNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ConversationRepository } from "../repositories/conversation-repository.js";
import type {
  AssignConversationInput,
  AssignConversationInternalInput,
  CloseConversationInput,
  ConversationRecord,
  CreateConversationInput,
  ListConversationsFilter,
  ReleaseConversationInput,
  ServiceContext,
  UpdateConversationMetadataInput,
  UpdateConversationPriorityInput,
  UpdateConversationStateInput,
} from "../types.js";
import { ASSIGNMENT_INTERNAL_TRUST } from "../types.js";
import {
  assertAssignmentVisibilityCompatibility,
  type AssignmentTargetVisibilityPort,
} from "./assignment-visibility-compatibility.js";
import {
  applyConversationListVisibilityFilter,
  assertCanReadConversations,
  assertConversationReadable,
} from "./conversation-visibility.js";

/**
 * Optional hook so priority mutations can refresh lifecycle.slaDueAt using the
 * authoritative Ticket SLA calculator without coupling this package to ticket-platform.
 */
export type ConversationPrioritySlaHook = {
  afterPriorityChange(input: {
    companyId: string;
    priority: string;
    metadata: Record<string, unknown>;
    referenceNow: Date;
  }): Promise<Record<string, unknown>>;
};

/**
 * Optional sync so human email assignment mirrors linked support_tickets.assigned_user_id.
 * AI routing must not use this path.
 */
export type ConversationLinkedTicketAssignmentSync = {
  syncAssignee(input: {
    companyId: string;
    conversationId: string;
    assignedUserId: string;
    actorUserId: string;
  }): Promise<void>;
};

export type ConversationServiceOptions = {
  prioritySlaHook?: ConversationPrioritySlaHook | null;
  assignmentGovernance?: AssignmentGovernancePort | null;
  linkedTicketAssignmentSync?: ConversationLinkedTicketAssignmentSync | null;
  assignmentAudit?: AssignmentAuditPort | null;
  /** Phase 6D Step 3 — target post-assignment readability (authoritative). */
  assignmentTargetVisibility?: AssignmentTargetVisibilityPort | null;
};

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function validateChannelType(channelType: string): void {
  if (!CONVERSATION_CHANNEL_TYPES.includes(channelType as (typeof CONVERSATION_CHANNEL_TYPES)[number])) {
    throw new ValidationError(`Unsupported channel type: ${channelType}`);
  }
}

function validateState(state: string): void {
  if (!CONVERSATION_STATES.includes(state as (typeof CONVERSATION_STATES)[number])) {
    throw new ValidationError(`Unsupported conversation state: ${state}`);
  }
}

function validatePriority(priority: string): void {
  if (!CONVERSATION_PRIORITIES.includes(priority as (typeof CONVERSATION_PRIORITIES)[number])) {
    throw new ValidationError(`Unsupported conversation priority: ${priority}`);
  }
}

export class ConversationService {
  private readonly prioritySlaHook: ConversationPrioritySlaHook | null;
  private readonly assignmentGovernance: AssignmentGovernancePort | null;
  private readonly linkedTicketAssignmentSync: ConversationLinkedTicketAssignmentSync | null;
  private readonly assignmentAudit: AssignmentAuditPort | null;
  private readonly assignmentTargetVisibility: AssignmentTargetVisibilityPort | null;

  constructor(
    private readonly repository: ConversationRepository,
    prioritySlaHookOrOptions: ConversationPrioritySlaHook | ConversationServiceOptions | null = null,
  ) {
    if (
      prioritySlaHookOrOptions &&
      typeof prioritySlaHookOrOptions === "object" &&
      ("prioritySlaHook" in prioritySlaHookOrOptions ||
        "assignmentGovernance" in prioritySlaHookOrOptions ||
        "linkedTicketAssignmentSync" in prioritySlaHookOrOptions ||
        "assignmentAudit" in prioritySlaHookOrOptions ||
        "assignmentTargetVisibility" in prioritySlaHookOrOptions)
    ) {
      const options = prioritySlaHookOrOptions as ConversationServiceOptions;
      this.prioritySlaHook = options.prioritySlaHook ?? null;
      this.assignmentGovernance = options.assignmentGovernance ?? null;
      this.linkedTicketAssignmentSync = options.linkedTicketAssignmentSync ?? null;
      this.assignmentAudit = options.assignmentAudit ?? null;
      this.assignmentTargetVisibility = options.assignmentTargetVisibility ?? null;
    } else {
      this.prioritySlaHook = (prioritySlaHookOrOptions as ConversationPrioritySlaHook | null) ?? null;
      this.assignmentGovernance = null;
      this.linkedTicketAssignmentSync = null;
      this.assignmentAudit = null;
      this.assignmentTargetVisibility = null;
    }
  }

  async createConversation(
    ctx: ServiceContext,
    input: CreateConversationInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    assertCompanyAccess(ctx, input.companyId);
    validateChannelType(input.channelType);
    if (input.initialState) validateState(input.initialState);
    if (input.priority) validatePriority(input.priority);

    let channelType = input.channelType;
    if (input.companyChannelId) {
      const companyChannel = await this.repository.resolveCompanyChannel(input.companyChannelId);
      if (!companyChannel) {
        throw new ValidationError("Company channel not found or inactive.");
      }
      if (companyChannel.companyId !== input.companyId) {
        throw new ValidationError("Company channel must belong to the same company as the conversation.");
      }
      if (!companyChannel.isEnabled) {
        throw new ValidationError("Company channel must be enabled before starting a conversation.");
      }
      channelType = companyChannel.channelKey;
    }

    return this.repository.create({
      ...input,
      channelType,
      createdBy: input.createdBy ?? ctx.userId,
    });
  }

  async getConversation(ctx: ServiceContext, conversationId: string): Promise<ConversationRecord> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) throw new ConversationNotFoundError(conversationId);

    assertCompanyAccess(ctx, conversation.company_id);
    assertConversationReadable(ctx, conversation);
    return conversation;
  }

  async getConversationByNumber(
    ctx: ServiceContext,
    companyId: string,
    conversationNumber: string,
  ): Promise<ConversationRecord> {
    assertCompanyAccess(ctx, companyId);

    const conversation = await this.repository.findByNumber(companyId, conversationNumber);
    if (!conversation) throw new ConversationNotFoundError(conversationNumber);

    assertConversationReadable(ctx, conversation);
    return conversation;
  }

  async listConversations(
    ctx: ServiceContext,
    filter: ListConversationsFilter,
  ): Promise<ConversationRecord[]> {
    assertCompanyAccess(ctx, filter.companyId);
    const scope = assertCanReadConversations(ctx);
    const scopedFilter = applyConversationListVisibilityFilter(filter, scope);

    if (scopedFilter.state) validateState(scopedFilter.state);
    if (scopedFilter.channelType) validateChannelType(scopedFilter.channelType);
    if (scopedFilter.priority) validatePriority(scopedFilter.priority);

    return this.repository.list(scopedFilter);
  }

  async closeConversation(
    ctx: ServiceContext,
    input: CloseConversationInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);

    const existing = await this.getConversation(ctx, input.conversationId);
    if (existing.state === "closed") return existing;

    return this.repository.close({
      ...input,
      updatedBy: input.updatedBy ?? ctx.userId,
    });
  }

  /**
   * User-facing / human assignment. Always runs Assignment Governance +
   * Visibility Compatibility when ports are configured.
   * Ignores any client-supplied skipAssignmentGovernance flag.
   */
  async assignConversation(
    ctx: ServiceContext,
    input: AssignConversationInput,
  ): Promise<ConversationRecord> {
    return this.executeAssignConversation(ctx, input, { skipGuards: false });
  }

  /**
   * Trusted AI / queue / system assignment. Requires ASSIGNMENT_INTERNAL_TRUST
   * (Symbol — not forgeable via JSON/HTTP). May skip AG + visibility when
   * skipAssignmentGovernance is true.
   */
  async assignConversationInternal(
    ctx: ServiceContext,
    input: AssignConversationInternalInput,
  ): Promise<ConversationRecord> {
    if (input.internalTrust !== ASSIGNMENT_INTERNAL_TRUST) {
      throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.takeover);
    }
    return this.executeAssignConversation(ctx, input, {
      skipGuards: Boolean(input.skipAssignmentGovernance),
    });
  }

  private async executeAssignConversation(
    ctx: ServiceContext,
    input: AssignConversationInput,
    options: { skipGuards: boolean },
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.takeover);
    const existing = await this.getConversation(ctx, input.conversationId);

    if (input.state) validateState(input.state);

    const actorUserId = (input.updatedBy ?? ctx.userId)?.trim() || null;
    const targetUserId = input.assignedUserId?.trim() || "";
    const skipGuards = options.skipGuards === true;

    if (targetUserId && actorUserId && this.assignmentGovernance && !skipGuards) {
      try {
        await this.assignmentGovernance.assertCanAssignToEmployee({
          actorUserId,
          targetUserId,
          resource: existing.channel_type === "email" ? "email_conversation" : "conversation",
        });
      } catch (error) {
        if (error instanceof AssignmentGovernanceError) {
          throw new PermissionDeniedError(
            `${CONVERSATION_PERMISSIONS.takeover} (${error.code}: ${error.message})`,
          );
        }
        throw error;
      }
    }

    // Phase 6D Step 3 — Visibility Compatibility (human / non-skip paths).
    if (targetUserId && this.assignmentTargetVisibility && !skipGuards) {
      await assertAssignmentVisibilityCompatibility({
        conversation: existing,
        targetUserId,
        companyId: existing.company_id,
        port: this.assignmentTargetVisibility,
      });
    }

    const record = await this.repository.assign({
      ...input,
      state: input.state ?? "transferred_to_human",
      updatedBy: input.updatedBy ?? ctx.userId,
    });

    if (
      existing.channel_type === "email" &&
      targetUserId &&
      actorUserId &&
      this.linkedTicketAssignmentSync
    ) {
      await this.linkedTicketAssignmentSync.syncAssignee({
        companyId: existing.company_id,
        conversationId: existing.id,
        assignedUserId: targetUserId,
        actorUserId,
      });
    }

    if (this.assignmentAudit && !input.skipAssignmentAudit) {
      await this.assignmentAudit.recordAssignmentChange({
        companyId: existing.company_id,
        actorUserId,
        resourceType:
          existing.channel_type === "email" ? "email_conversation" : "conversation",
        resourceId: existing.id,
        previousAssigneeUserId: existing.assigned_user_id,
        newAssigneeUserId: targetUserId || null,
        source: input.assignmentAuditSource ?? "human",
      });
    }

    return record;
  }

  async releaseConversation(
    ctx: ServiceContext,
    input: ReleaseConversationInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.release);
    const existing = await this.getConversation(ctx, input.conversationId);

    if (input.state) validateState(input.state);

    const record = await this.repository.release({
      ...input,
      state: input.state ?? "waiting_user",
      updatedBy: input.updatedBy ?? ctx.userId,
    });

    if (this.assignmentAudit && !input.skipAssignmentAudit) {
      const actorUserId = (input.updatedBy ?? ctx.userId)?.trim() || null;
      await this.assignmentAudit.recordAssignmentChange({
        companyId: existing.company_id,
        actorUserId,
        resourceType:
          existing.channel_type === "email" ? "email_conversation" : "conversation",
        resourceId: existing.id,
        previousAssigneeUserId: existing.assigned_user_id,
        newAssigneeUserId: null,
        source: input.assignmentAuditSource ?? "human",
      });
    }

    return record;
  }

  async updateState(
    ctx: ServiceContext,
    input: UpdateConversationStateInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    await this.getConversation(ctx, input.conversationId);
    validateState(input.state);

    return this.repository.updateState({
      ...input,
      updatedBy: input.updatedBy ?? ctx.userId,
    });
  }

  async updatePriority(
    ctx: ServiceContext,
    input: UpdateConversationPriorityInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    const existing = await this.getConversation(ctx, input.conversationId);
    validatePriority(input.priority);

    const companyId = existing.company_id?.trim();
    if (!companyId) {
      throw new ValidationError("Company context is required to update conversation priority SLA.");
    }

    const referenceNow = new Date();
    let metadata: Record<string, unknown> | undefined;
    if (this.prioritySlaHook) {
      // Compute SLA before any write — failure leaves priority unchanged.
      metadata = await this.prioritySlaHook.afterPriorityChange({
        companyId,
        priority: input.priority,
        metadata: existing.metadata ?? {},
        referenceNow,
      });
    }

    return this.repository.updatePriority({
      ...input,
      metadata,
      updatedBy: input.updatedBy ?? ctx.userId,
    });
  }

  async updateMetadata(
    ctx: ServiceContext,
    input: UpdateConversationMetadataInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    await this.getConversation(ctx, input.conversationId);

    return this.repository.updateMetadata({
      ...input,
      updatedBy: input.updatedBy ?? ctx.userId,
    });
  }

  async resetEmployeeUnread(ctx: ServiceContext, conversationId: string): Promise<ConversationRecord> {
    await this.getConversation(ctx, conversationId);

    return this.repository.resetEmployeeUnread(conversationId, ctx.userId);
  }

  async resetCustomerUnread(ctx: ServiceContext, conversationId: string): Promise<ConversationRecord> {
    await this.getConversation(ctx, conversationId);

    return this.repository.resetCustomerUnread(conversationId, ctx.userId);
  }
}
