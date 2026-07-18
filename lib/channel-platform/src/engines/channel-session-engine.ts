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
      if (!input.aiAssistantId) {
        throw new ValidationError("aiAssistantId is required when creating a new channel session.");
      }

      const created = await this.ports.conversation.createConversation({
        companyId: input.companyId,
        aiAssistantId: input.aiAssistantId,
        companyChannelId: input.companyChannelId,
        channelType: input.channelKey,
        metadata: {
          externalThreadId: input.externalThreadId,
          senderExternalId: input.senderExternalId ?? null,
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
