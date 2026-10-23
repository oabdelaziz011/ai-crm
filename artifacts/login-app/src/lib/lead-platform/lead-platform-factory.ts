import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  createSupabaseLeadAuditPort,
  type LeadDomainEvent,
  type LeadEventPublisherPort,
  type LeadPlatformServices,
} from "@workspace/lead-platform";
import { createModulePublisher } from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";
import {
  createLeadNotificationBridge,
  createLoginAppLeadAssigneeResolverPort,
} from "./lead-platform-adapters.js";
import { createLoginAppLeadConversionPort } from "./lead-conversion-port-adapter.js";
import { createLoginAppLeadOpportunityConversionPort } from "./lead-opportunity-conversion-port-adapter.js";
import { createLoginAppLeadOpportunityStageSyncPort } from "./lead-opportunity-stage-sync-port-adapter.js";
import { isPlatformEventTelemetryFailure } from "./platform-event-telemetry.js";

export function createLeadEventBridge(client: SupabaseClient): LeadEventPublisherPort {
  return {
    async publish(event: LeadDomainEvent): Promise<void> {
      const publisher = createModulePublisher(getLoginAppPlatformEventBus(client), "leads");
      const ctx = {
        tenantId: event.companyId,
        correlationId: `${event.leadId}:${event.type}:${event.occurredAt}`,
        actorId: typeof event.payload.actorUserId === "string" ? event.payload.actorUserId : undefined,
        actorType: "user" as const,
        sourceModule: "leads",
        entityType: "lead",
        entityId: event.leadId,
      };

      if (event.type === "lead_created") {
        await publisher.publish(
          "LeadCreated",
          { leadId: event.leadId, title: String(event.payload.title ?? "Lead"), source: String(event.payload.source ?? "") },
          ctx,
        );
      } else if (event.type === "lead_converted") {
        await publisher.publish(
          "LeadConverted",
          { leadId: event.leadId, customerId: String(event.payload.customerId ?? "") },
          ctx,
        );
      } else if (event.type.startsWith("lead_")) {
        await publisher.publish(
          "LeadUpdated",
          { leadId: event.leadId, changedFields: [event.type], patch: event.payload as Record<string, unknown> },
          ctx,
        );
      }
    },
  };
}

function describePublishError(error: unknown): { name: string | null; message: string | null; code: string | null } {
  if (error instanceof Error) return { name: error.name, message: error.message, code: null };
  if (error && typeof error === "object") {
    const row = error as { name?: unknown; message?: unknown; code?: unknown };
    return {
      name: row.name != null ? String(row.name) : null,
      message: row.message != null ? String(row.message) : null,
      code: row.code != null ? String(row.code) : null,
    };
  }
  return { name: null, message: String(error), code: null };
}

/**
 * Authoritative post-qualification side effects for lead lifecycle events:
 * - sales follow-up scheduling (all handled lifecycle types)
 * - product-interest → opportunity promotion (lead_qualified only)
 *
 * Callers must not schedule follow-up or apply product interest separately after qualify.
 */
export function createSalesFollowUpAwareLeadEventPublisher(
  client: SupabaseClient,
  base: LeadEventPublisherPort,
): LeadEventPublisherPort {
  return {
    async publish(event: LeadDomainEvent): Promise<void> {
      let requiredPublishFailure: unknown = null;
      try {
        await base.publish(event);
      } catch (error: unknown) {
        const described = describePublishError(error);
        if (isPlatformEventTelemetryFailure(error)) {
          console.error("[lead-events] platform event telemetry failed", {
            event: event.type,
            companyId: event.companyId,
            leadId: event.leadId,
            classification: "telemetry",
            err: described,
          });
        } else {
          requiredPublishFailure = error;
          console.error("[lead-events] required event publish failed", {
            event: event.type,
            companyId: event.companyId,
            leadId: event.leadId,
            classification: "required",
            err: described,
          });
        }
      }
      void import("@workspace/automation-platform")
        .then(({ handleSalesFollowUpLeadLifecycleEvent }) =>
          handleSalesFollowUpLeadLifecycleEvent(client, {
            type: event.type,
            companyId: event.companyId,
            leadId: event.leadId,
            payload: event.payload as Record<string, unknown>,
          }),
        )
        .then((result) => {
          if (!result) return;
          if (result.action === "schedule" || result.action === "skipped") {
            console.info("[sales-follow-up] lifecycle", {
              event: event.type,
              companyId: event.companyId,
              leadId: event.leadId,
              action: result.action,
              detail: result.detail ?? null,
            });
          }
        })
        .catch((error: unknown) => {
          console.error("[sales-follow-up] lifecycle side effect failed", {
            event: event.type,
            companyId: event.companyId,
            leadId: event.leadId,
            err: error instanceof Error ? { message: error.message, name: error.name } : error,
          });
        });

      if (event.type === "lead_qualified") {
        // Await opportunity promotion so create_draft_quote (same turn) can see the opp.
        try {
          const { applyStoredProductInterestAfterQualify } = await import(
            "@workspace/opportunity-platform"
          );
          const result = await applyStoredProductInterestAfterQualify(client, {
            companyId: event.companyId,
            leadId: event.leadId,
          });
          console.info("[product-interest] after qualify", {
            companyId: event.companyId,
            leadId: event.leadId,
            applied: result?.applied ?? false,
            reason: result?.reason ?? null,
            opportunityId:
              result && "opportunityId" in result && result.opportunityId
                ? String(result.opportunityId)
                : null,
          });
        } catch (error: unknown) {
          console.error("[product-interest] after qualify side effect failed", {
            companyId: event.companyId,
            leadId: event.leadId,
            classification: "required",
            err: error instanceof Error ? { message: error.message, name: error.name } : error,
          });
          throw error;
        }
      }
      if (requiredPublishFailure) throw requiredPublishFailure;
    },
  };
}

export function createLoginAppLeadPlatformServices(
  client: SupabaseClient,
  options?: { assignmentGovernance?: boolean | null },
): LeadPlatformServices {
  return createLeadPlatformServices(client, {
    assignees: createLoginAppLeadAssigneeResolverPort(client),
    conversion: createLoginAppLeadConversionPort(client),
    opportunityConversion: createLoginAppLeadOpportunityConversionPort(client),
    opportunityStageSync: createLoginAppLeadOpportunityStageSyncPort(client),
    events: createSalesFollowUpAwareLeadEventPublisher(client, createLeadEventBridge(client)),
    notifications: createLeadNotificationBridge(),
    audit: createSupabaseLeadAuditPort(client),
    assignmentGovernance: options?.assignmentGovernance,
  });
}
