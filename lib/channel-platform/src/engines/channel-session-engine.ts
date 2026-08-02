import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ResolveSessionInput } from "../repositories/channel-platform-repositories.js";
import type { ChannelSessionRepository } from "../repositories/channel-platform-repositories.js";
import type { ChannelSessionRecord, ServiceContext } from "../types.js";
import { ValidationError } from "../errors.js";

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
    if (existing) return existing;

    let conversationId = input.conversationId;

    if (!conversationId) {
      const requireAiAssistant = input.requireAiAssistant !== false;
      let aiAssistantId = input.aiAssistantId?.trim() || null;

      if (!aiAssistantId && !requireAiAssistant) {
        aiAssistantId = (await this.ports.conversation.resolveCompanyAssistantId?.(input.companyId)) ?? null;
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
      conversationId = created.id;
    }

    return this.sessionRepository.createSession({
      ...input,
      conversationId,
    });
  }
}
