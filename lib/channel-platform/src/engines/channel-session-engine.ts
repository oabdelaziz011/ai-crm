import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ResolveSessionInput } from "../repositories/channel-platform-repositories.js";
import type { ChannelSessionRepository } from "../repositories/channel-platform-repositories.js";
import type { ChannelSessionRecord, ServiceContext } from "../types.js";
import { ValidationError } from "../errors.js";

function readAiEmployeeId(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const value = metadata.aiEmployeeId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class ChannelSessionEngine {
  constructor(
    private readonly sessionRepository: ChannelSessionRepository,
    private readonly ports: ChannelPlatformPorts,
  ) {}

  async resolveSession(
    ctx: ServiceContext,
    input: ResolveSessionInput,
  ): Promise<ChannelSessionRecord> {
    const existing = await this.sessionRepository.findByExternalThread(
      input.companyChannelId,
      input.externalThreadId,
    );

    if (existing) {
      const rotated = await this.maybeRotateForAiEmployee(ctx, input, existing);
      return rotated ?? existing;
    }

    let conversationId = input.conversationId;

    if (!conversationId) {
      const desiredEmployeeId = readAiEmployeeId(input.employeeConversationMetadata);
      conversationId = await this.createConversationForSession({
        ...input,
        employeeConversationMetadata:
          desiredEmployeeId && input.requireAiAssistant !== false
            ? {
                ...(input.employeeConversationMetadata ?? {}),
                aiEmployeeInboundSession: true,
              }
            : input.employeeConversationMetadata,
      });
    }

    return this.sessionRepository.createSession({
      ...input,
      conversationId,
    });
  }

  /**
   * When AI Employee takes over a WhatsApp/Messenger thread that previously ran
   * automation, reuse of the same conversation pollutes prompt context with
   * booking-list replies. Rotate to a fresh conversation bound to the employee.
   */
  private async maybeRotateForAiEmployee(
    ctx: ServiceContext,
    input: ResolveSessionInput,
    existing: ChannelSessionRecord,
  ): Promise<ChannelSessionRecord | null> {
    const preferAi = input.requireAiAssistant !== false;
    const desiredEmployeeId = readAiEmployeeId(input.employeeConversationMetadata);
    if (!preferAi || !desiredEmployeeId) return null;
    if (!this.ports.conversation.getConversationMetadata) return null;

    const currentMeta = await this.ports.conversation.getConversationMetadata(
      existing.conversation_id,
    );
    const currentEmployeeId = readAiEmployeeId(currentMeta);
    const cleanAiSession = currentMeta?.aiEmployeeInboundSession === true;
    // Rotate when switching onto AI, or when the thread never got a clean AI session
    // marker (e.g. AI previously wrote into an automation-polluted conversation).
    if (currentEmployeeId === desiredEmployeeId && cleanAiSession) return null;

    const conversationId = await this.createConversationForSession({
      ...input,
      employeeConversationMetadata: {
        ...(input.employeeConversationMetadata ?? {}),
        aiEmployeeInboundSession: true,
      },
    });
    return this.sessionRepository.reattachConversation(existing.id, conversationId);
  }

  private async createConversationForSession(input: ResolveSessionInput): Promise<string> {
    const requireAiAssistant = input.requireAiAssistant !== false;
    let aiAssistantId = input.aiAssistantId?.trim() || null;

    if (!aiAssistantId && !requireAiAssistant) {
      aiAssistantId =
        (await this.ports.conversation.resolveCompanyAssistantId?.(input.companyId)) ?? null;
    }

    if (!aiAssistantId && requireAiAssistant) {
      throw new ValidationError("aiAssistantId is required when creating a new channel session.");
    }

    if (!aiAssistantId) {
      throw new ValidationError(
        "A company AI assistant record is required when creating a new workflow channel session.",
      );
    }

    const created = await this.ports.conversation.createConversation({
      companyId: input.companyId,
      aiAssistantId,
      companyChannelId: input.companyChannelId,
      channelType: input.channelKey,
      metadata: {
        externalThreadId: input.externalThreadId,
        senderExternalId: input.senderExternalId ?? null,
        ...(input.employeeConversationMetadata ?? {}),
        ...(input.metadata ?? {}),
      },
    });
    return created.id;
  }
}
