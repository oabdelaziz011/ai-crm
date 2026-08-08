import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOpportunityPlatformServices,
  createNoopOpportunityEventPublisher,
  type OpportunityEventPublisherPort,
  type OpportunityPlatformServices,
} from "@workspace/opportunity-platform";
import { createModulePublisher } from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";

export function createOpportunityEventBridge(): OpportunityEventPublisherPort {
  const bus = () => createModulePublisher(getLoginAppPlatformEventBus(), "opportunities");

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
    },
  };
}

export function createLoginAppOpportunityPlatformServices(
  client: SupabaseClient,
): OpportunityPlatformServices {
  return createOpportunityPlatformServices(client, {
    events: createOpportunityEventBridge(),
  });
}

export function createLoginAppOpportunityPlatformServicesSilent(
  client: SupabaseClient,
): OpportunityPlatformServices {
  return createOpportunityPlatformServices(client, {
    events: createNoopOpportunityEventPublisher(),
  });
}

export { mapOpportunityRecordToReadModel } from "./map-opportunity-record.js";
