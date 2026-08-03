import { CONVERSATION_PERMISSIONS, MESSAGE_TYPES } from "../constants.js";
import {
  buildMessagePreview,
  resolveParticipantTypeForCache,
} from "../message-cache.js";
import {
  ConversationNotFoundError,
  DuplicateExternalMessageError,
  ParticipantNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ConversationRecord } from "../types.js";
import type { ConversationRepository } from "../repositories/conversation-repository.js";
import type { MessageRepository } from "../repositories/message-repository.js";
import type { ParticipantRepository } from "../repositories/participant-repository.js";
import type {
  AddMessageInput,
  ConversationMessageRecord,
  ListMessagesFilter,
  ServiceContext,
} from "../types.js";
import { readBrowserWindow, traceOmniSendBridgeAsync } from "../debug/omni-send-bridge.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function validateMessageType(messageType: string): void {
  if (!MESSAGE_TYPES.includes(messageType as (typeof MESSAGE_TYPES)[number])) {
    throw new ValidationError(`Unsupported message type: ${messageType}`);
  }
}

export class MessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly participantRepository: ParticipantRepository,
  ) {}

  private assertCompanyAccess(ctx: ServiceContext, conversation: ConversationRecord): void {
    if (ctx.isSuperAdmin) return;
    if (conversation.company_id !== ctx.companyId) {
      throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.view);
    }
  }

  private async getReadableConversation(
    ctx: ServiceContext,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) throw new ConversationNotFoundError(conversationId);
    this.assertCompanyAccess(ctx, conversation);
    return conversation;
  }

  private async getWritableConversation(
    ctx: ServiceContext,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const conversation = await this.getReadableConversation(ctx, conversationId);
    if (conversation.state === "closed") {
      throw new ValidationError("Cannot add messages to a closed conversation.");
    }
    return conversation;
  }

  async addMessage(ctx: ServiceContext, input: AddMessageInput): Promise<ConversationMessageRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    validateMessageType(input.messageType);

    const conversation = await this.getWritableConversation(ctx, input.conversationId);

    let participantType = null as ReturnType<typeof resolveParticipantTypeForCache>;
    if (input.participantId) {
      const participant = await this.participantRepository.findById(input.participantId);
      if (!participant || participant.conversation_id !== input.conversationId) {
        throw new ParticipantNotFoundError(input.participantId);
      }
      participantType = participant.participant_type;
    }

    const message = await traceOmniSendBridgeAsync(
      {
        layer: 4,
        stage: "ConversationService.addMessage",
        file: "message-service.ts",
        function: "addMessage",
        line: 87,
        conversationId: input.conversationId,
        messageId: null,
        statusBefore: input.status ?? "pending",
        extra: { messageType: input.messageType },
      },
      () => this.messageRepository.add({
        ...input,
        createdBy: input.createdBy ?? ctx.userId,
      }),
      (result) => ({
        messageId: result.id,
        statusAfter: result.status,
        extra: { sequenceNumber: result.sequence_number },
      }),
    );

    await (async () => {
      const browserWindow = readBrowserWindow();
      browserWindow?.__traceOmniSendEnter__?.({
        layer: 10,
        stage: "Database.conversation.applyMessageCache",
        file: "message-service.ts",
        function: "applyMessageCache",
        line: 111,
        conversationId: input.conversationId,
        messageId: message.id,
        statusBefore: message.status,
      });
      await this.conversationRepository.applyMessageCache({
        conversationId: input.conversationId,
        messageAt: message.created_at,
        preview: buildMessagePreview(message.content),
        participantType: resolveParticipantTypeForCache(participantType, input.messageType),
        messageType: input.messageType,
        conversationNumber: conversation.conversation_number,
        externalThreadId: conversation.external_thread_id,
        currentUnreadEmployee: conversation.unread_count_employee,
        currentUnreadCustomer: conversation.unread_count_customer,
      });
      browserWindow?.__traceOmniSendExit__?.({
        layer: 10,
        stage: "Database.conversation.applyMessageCache",
        success: true,
        conversationId: input.conversationId,
        messageId: message.id,
        statusAfter: message.status,
      });
    })();

    return message;
  }

  async findByConversationAndExternalMessageId(
    ctx: ServiceContext,
    conversationId: string,
    externalMessageId: string,
  ): Promise<ConversationMessageRecord | null> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    await this.getReadableConversation(ctx, conversationId);
    return this.messageRepository.findByConversationAndExternalMessageId(conversationId, externalMessageId);
  }

  async addIncomingMessageIdempotent(
    ctx: ServiceContext,
    input: AddMessageInput,
  ): Promise<{ message: ConversationMessageRecord; reused: boolean }> {
    try {
      return { message: await this.addMessage(ctx, input), reused: false };
    } catch (error) {
      if (error instanceof DuplicateExternalMessageError && input.externalMessageId) {
        const existing = await this.findByConversationAndExternalMessageId(
          ctx,
          input.conversationId,
          input.externalMessageId,
        );
        if (existing) {
          return { message: existing, reused: true };
        }
      }
      throw error;
    }
  }

  async listMessages(
    ctx: ServiceContext,
    filter: ListMessagesFilter,
  ): Promise<ConversationMessageRecord[]> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    await this.getReadableConversation(ctx, filter.conversationId);

    const messages = await this.messageRepository.list(filter);

    if (filter.markEmployeeRead) {
      await this.conversationRepository.resetEmployeeUnread(filter.conversationId, ctx.userId);
    }
    if (filter.markCustomerRead) {
      await this.conversationRepository.resetCustomerUnread(filter.conversationId, ctx.userId);
    }

    return messages;
  }
}
