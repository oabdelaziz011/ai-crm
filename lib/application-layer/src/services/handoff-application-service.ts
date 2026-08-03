import type { ApplicationContext, CommandResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline } from "../pipeline/command-query-pipeline.js";
import type { HandoffEscalationTrigger, HandoffOwnershipModel } from "../ports/handoff-ports.js";
import * as HandoffCommandHandlers from "../handlers/commands/handoff-command-handlers.js";

export class HandoffApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  escalateToHuman(
    request: {
      conversationId: string;
      triggerCode: HandoffEscalationTrigger;
      reason: string;
      targetQueueId?: string;
      aiAssistantId?: string;
    },
    context: ApplicationContext,
  ): Promise<CommandResult<{ requestId: string; ownership: HandoffOwnershipModel }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "EscalateToHuman",
      request,
      context,
      requiredPermissions: ["handoff.escalate"],
      handler: async (req, ctx) => {
        const { response } = await HandoffCommandHandlers.handleEscalateToHuman(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  queueForHuman(
    request: { conversationId: string; queueId: string; reason: string; aiAssistantId?: string },
    context: ApplicationContext,
  ): Promise<CommandResult<{ queuePosition: number; estimatedWaitSeconds: number }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "QueueForHuman",
      request,
      context,
      requiredPermissions: ["handoff.queue"],
      handler: async (req, ctx) => {
        const { response } = await HandoffCommandHandlers.handleQueueForHuman(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  returnToAi(
    request: { conversationId: string; reason: string },
    context: ApplicationContext,
  ): Promise<CommandResult<{ ownership: HandoffOwnershipModel }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ReturnToAi",
      request,
      context,
      requiredPermissions: ["handoff.return_to_ai"],
      handler: async (req, ctx) => {
        const { response } = await HandoffCommandHandlers.handleReturnToAi(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}
