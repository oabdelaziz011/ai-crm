import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOpportunityPlatformServices,
  createNoopOpportunityEventPublisher,
  type OpportunityEventPublisherPort,
  type OpportunityPlatformServices,
} from "@workspace/opportunity-platform";
import { createModulePublisher } from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";
import { cancelSalesFollowUpsAfterOpportunityLifecycle } from "./opportunity-follow-up-cancel.js";

export {
  cancelSalesFollowUpsAfterOpportunityLifecycle,
  opportunityFollowUpCancelReason,
} from "./opportunity-follow-up-cancel.js";

export function createOpportunityEventBridge(
  client?: SupabaseClient,
  options?: { onFollowUpCancelError?: (error: unknown) => void },
): OpportunityEventPublisherPort {
  const bus = () => createModulePublisher(getLoginAppPlatformEventBus(), "opportunities");

  const cancelFollowUps = (lifecycle: "won" | "lost", input: { companyId: string; opportunityId: string }) =>
    cancelSalesFollowUpsAfterOpportunityLifecycle(
      client,
      { ...input, lifecycle },
      { onError: options?.onFollowUpCancelError },
    );

  return {
    async publishCreated(input) {
      await bus().publish(
        "OpportunityCreated",
        {
          opportunityId: input.opportunityId,
          name: input.name,
          leadId: input.leadId,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:created`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
    async publishStageChanged(input) {
      await bus().publish(
        "OpportunityStageChanged",
        {
          opportunityId: input.opportunityId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
          stageKey: input.stageKey,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:stage:${input.toStageId}`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
    async publishProbabilityChanged(input) {
      await bus().publish(
        "OpportunityProbabilityChanged",
        {
          opportunityId: input.opportunityId,
          previousPercent: input.previousPercent,
          nextPercent: input.nextPercent,
          source: input.source,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:probability`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
    async publishNegotiationStarted(input) {
      await bus().publish(
        "OpportunityNegotiationStarted",
        { opportunityId: input.opportunityId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:negotiation`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
    async publishWon(input) {
      await bus().publish(
        "OpportunityWon",
        { opportunityId: input.opportunityId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:won`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      void cancelFollowUps("won", {
        companyId: input.companyId,
        opportunityId: input.opportunityId,
      });
    },
    async publishLost(input) {
      await bus().publish(
        "OpportunityLost",
        {
          opportunityId: input.opportunityId,
          companyId: input.companyId,
          reason: input.reason,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:lost`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      void cancelFollowUps("lost", {
        companyId: input.companyId,
        opportunityId: input.opportunityId,
      });
    },
  };
}

export function createLoginAppOpportunityPlatformServices(
  client: SupabaseClient,
): OpportunityPlatformServices {
  return createOpportunityPlatformServices(client, {
    events: createOpportunityEventBridge(client),
  });
}

export function createLoginAppOpportunityPlatformServicesSilent(
  client: SupabaseClient,
): OpportunityPlatformServices {
  return createOpportunityPlatformServices(client, {
    events: createNoopOpportunityEventPublisher(),
  });
}

export { loadLeadLifecycleById, mapOpportunityRecordToReadModel } from "./map-opportunity-record.js";
