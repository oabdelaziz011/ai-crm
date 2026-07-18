import { CONVERSATION_PERMISSIONS, PARTICIPANT_TYPES } from "../constants.js";
import {
  ConversationNotFoundError,
  ParticipantNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ConversationRepository } from "../repositories/conversation-repository.js";
import type { ParticipantRepository } from "../repositories/participant-repository.js";
import type {
  AddParticipantInput,
  ConversationParticipantRecord,
  ServiceContext,
} from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function validateParticipantType(participantType: string): void {
  if (!PARTICIPANT_TYPES.includes(participantType as (typeof PARTICIPANT_TYPES)[number])) {
    throw new ValidationError(`Unsupported participant type: ${participantType}`);
  }
}

export class ParticipantService {
  constructor(
    private readonly participantRepository: ParticipantRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  private async assertConversationAccess(ctx: ServiceContext, conversationId: string): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) throw new ConversationNotFoundError(conversationId);
    if (!ctx.isSuperAdmin && conversation.company_id !== ctx.companyId) {
      throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.view);
    }
  }

  async addParticipant(
    ctx: ServiceContext,
    input: AddParticipantInput,
  ): Promise<ConversationParticipantRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);
    validateParticipantType(input.participantType);
    await this.assertConversationAccess(ctx, input.conversationId);

    return this.participantRepository.add({
      ...input,
      createdBy: input.createdBy ?? ctx.userId,
    });
  }

  async removeParticipant(
    ctx: ServiceContext,
    participantId: string,
  ): Promise<ConversationParticipantRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);

    const participant = await this.participantRepository.findById(participantId);
    if (!participant) throw new ParticipantNotFoundError(participantId);

    await this.assertConversationAccess(ctx, participant.conversation_id);

    return this.participantRepository.remove(participantId, ctx.userId);
  }

  async listParticipants(
    ctx: ServiceContext,
    conversationId: string,
  ): Promise<ConversationParticipantRecord[]> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);
    await this.assertConversationAccess(ctx, conversationId);

    return this.participantRepository.listByConversation(conversationId);
  }
}
