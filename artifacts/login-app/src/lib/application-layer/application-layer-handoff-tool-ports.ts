import type { HandoffAgentToolPorts } from "@workspace/ai-tool-router";
import type { HandoffEscalationTrigger } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapCommand,
} from "./application-layer-tool-context.js";

/** Handoff AI tools — all operations route through HandoffApplicationService + Platform Event Bus. */
export function createApplicationLayerHandoffToolPorts(portContext: LoginAppPortContext): HandoffAgentToolPorts {
  const services = createLoginAppApplicationServices(portContext);

  return {
    async escalateToHuman(input) {
      const ctx = buildToolApplicationContext(portContext, portContext.actorUserId);
      const result = await services.handoff.escalateToHuman(
        {
          conversationId: input.conversationId,
          triggerCode: input.triggerCode as HandoffEscalationTrigger,
          reason: input.reason,
          targetQueueId: input.targetQueueId,
          aiAssistantId: input.aiAssistantId,
        },
        ctx,
      );
      const payload = unwrapCommand(result);
      return {
        ownership: {
          ownerType: payload.ownership.ownerType,
          ownerLabel: payload.ownership.ownerLabel ?? "",
        },
        requestId: payload.requestId,
      };
    },
    async queueForHuman(input) {
      const ctx = buildToolApplicationContext(portContext, portContext.actorUserId);
      const result = await services.handoff.queueForHuman(
        {
          conversationId: input.conversationId,
          queueId: input.queueId,
          reason: input.reason,
          aiAssistantId: input.aiAssistantId,
        },
        ctx,
      );
      return unwrapCommand(result);
    },
    async returnToAi(input) {
      const ctx = buildToolApplicationContext(portContext, portContext.actorUserId);
      const result = await services.handoff.returnToAi(
        { conversationId: input.conversationId, reason: input.reason },
        ctx,
      );
      return unwrapCommand(result);
    },
  };
}
