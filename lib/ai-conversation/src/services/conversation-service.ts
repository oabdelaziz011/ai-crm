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
  constructor(private readonly repository: ConversationRepository) {}

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
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) throw new ConversationNotFoundError(conversationId);

    assertCompanyAccess(ctx, conversation.company_id);
    return conversation;
  }

  async getConversationByNumber(
    ctx: ServiceContext,
    companyId: string,
    conversationNumber: string,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);

    const conversation = await this.repository.findByNumber(companyId, conversationNumber);
    if (!conversation) throw new ConversationNotFoundError(conversationNumber);

    return conversation;
  }

  async listConversations(
    ctx: ServiceContext,
    filter: ListConversationsFilter,
  ): Promise<ConversationRecord[]> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);

    if (filter.state) validateState(filter.state);
    if (filter.channelType) validateChannelType(filter.channelType);
    if (filter.priority) validatePriority(filter.priority);

    return this.repository.list(filter);
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

  async assignConversation(
    ctx: ServiceContext,
    input: AssignConversationInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.takeover);
    await this.getConversation(ctx, input.conversationId);

    if (input.state) validateState(input.state);

    return this.repository.assign({
      ...input,
      state: input.state ?? "transferred_to_human",
      updatedBy: input.updatedBy ?? ctx.userId,
    });
  }

  async releaseConversation(
    ctx: ServiceContext,
    input: ReleaseConversationInput,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.release);
    await this.getConversation(ctx, input.conversationId);

    if (input.state) validateState(input.state);

    return this.repository.release({
      ...input,
      state: input.state ?? "waiting_user",
      updatedBy: input.updatedBy ?? ctx.userId,
    });
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
    await this.getConversation(ctx, input.conversationId);
    validatePriority(input.priority);

    return this.repository.updatePriority({
      ...input,
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
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    await this.getConversation(ctx, conversationId);

    return this.repository.resetEmployeeUnread(conversationId, ctx.userId);
  }

  async resetCustomerUnread(ctx: ServiceContext, conversationId: string): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    await this.getConversation(ctx, conversationId);

    return this.repository.resetCustomerUnread(conversationId, ctx.userId);
  }
}
