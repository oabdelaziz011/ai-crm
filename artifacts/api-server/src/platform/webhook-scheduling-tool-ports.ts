import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffAgentToolPorts,
  createSchedulingEnginePortFromAdapters,
  createSchedulingToolPorts,
  type SchedulingToolPorts,
} from "@workspace/ai-tool-router";
import { createProductDemoSchedulingServices } from "@workspace/product-demo-scheduling";
import { createBookingDomainStack } from "@workspace/scheduling-engine";
import {
  demoBookingShouldSyncCrm,
  syncSalesDemoBookingCancelledToCrm,
  syncSalesDemoBookingRescheduledToCrm,
  syncSalesDemoBookingToCrm,
} from "../services/sales-demo-crm-lifecycle.js";
import { logger } from "../lib/logger.js";
import { createWebhookHandoffPlatformForTools } from "./create-webhook-handoff-platform.js";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";

export function createWebhookSchedulingToolPorts(client: SupabaseClient): SchedulingToolPorts {
  const { availabilityEngine, slotGenerationEngine, bookingDomain } = createBookingDomainStack(client);
  const engines = createSchedulingEnginePortFromAdapters({
    slotGenerationEngine,
    availabilityEngine,
  });
  const productDemo = createProductDemoSchedulingServices(client);
  const ports = createSchedulingToolPorts(client, engines, bookingDomain, {
    queries: productDemo.queries,
    commands: productDemo.commands,
  });
  const handoffPorts = createHandoffAgentToolPorts(client, {
    platform: createWebhookHandoffPlatformForTools(client),
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  return {
    ...ports,
    async createBooking(input) {
      const result = await ports.createBooking({
        ...input,
        source: input.source ?? "whatsapp",
      });
      if (result.success && input.conversationId && input.customerId) {
        await client
          .from("conversations")
          .update({ customer_id: input.customerId })
          .eq("id", input.conversationId)
          .eq("company_id", input.companyId)
          .is("customer_id", null);
      }
      return result;
    },
    async createDemoBooking(input) {
      if (!ports.createDemoBooking) {
        return {
          success: false,
          errors: ["NOT_CONFIGURED"],
          message: "Demo booking is not configured.",
        };
      }
      const result = await ports.createDemoBooking({
        ...input,
        source: input.source ?? "whatsapp",
      });
      if (
        demoBookingShouldSyncCrm({
          success: result.success,
          bookingId: result.bookingId,
          customerId: input.customerId,
        })
      ) {
        try {
          await syncSalesDemoBookingToCrm(client, {
            companyId: input.companyId,
            userId: input.userId,
            customerId: input.customerId,
            bookingId: result.bookingId,
            conversationId: input.conversationId ?? null,
          });
        } catch (error) {
          logger.warn(
            {
              event: "sales.demo.crm.sync_error",
              companyId: input.companyId,
              bookingId: result.bookingId,
              err: error instanceof Error ? error.message : String(error),
            },
            "Demo CRM sync failed after successful booking (booking kept)",
          );
        }
      }
      return result;
    },
    async cancelBooking(input) {
      const result = await ports.cancelBooking(input);
      if (result.success && result.bookingId) {
        try {
          await syncSalesDemoBookingCancelledToCrm(client, {
            companyId: input.companyId,
            userId: input.userId,
            bookingId: result.bookingId,
          });
        } catch (error) {
          logger.warn(
            {
              event: "sales.demo.crm.cancel_sync_error",
              companyId: input.companyId,
              bookingId: result.bookingId,
              err: error instanceof Error ? error.message : String(error),
            },
            "Demo cancel CRM sync failed after successful cancel (booking kept cancelled)",
          );
        }
      }
      return result;
    },
    async rescheduleBooking(input) {
      const result = await ports.rescheduleBooking(input);
      if (result.success && result.bookingId) {
        try {
          await syncSalesDemoBookingRescheduledToCrm(client, {
            companyId: input.companyId,
            userId: input.userId,
            bookingId: result.bookingId,
            conversationId: input.conversationId ?? null,
          });
        } catch (error) {
          logger.warn(
            {
              event: "sales.demo.crm.reschedule_sync_error",
              companyId: input.companyId,
              bookingId: result.bookingId,
              err: error instanceof Error ? error.message : String(error),
            },
            "Demo reschedule CRM sync failed after successful reschedule (booking kept)",
          );
        }
      }
      return result;
    },
    async handoffAfterDemoBooking(input) {
      try {
        const handed = await handoffPorts.escalateToHuman({
          companyId: input.companyId,
          conversationId: input.conversationId,
          triggerCode: "customer_requested",
          reason: input.reason,
        });
        const ownerType = handed.ownership?.ownerType ?? null;
        const assigned = handed.assigned === true;
        const queued = handed.queued === true;
        const succeeded = assigned || queued || ownerType === "human_agent" || ownerType === "queue";
        return { succeeded, ownerType, assigned, queued };
      } catch (error) {
        logger.warn(
          {
            event: "sales.demo.handoff_error",
            companyId: input.companyId,
            bookingId: input.bookingId,
            err: error instanceof Error ? error.message : "handoff_failed",
          },
          "Demo booking kept; human handoff was not confirmed",
        );
        return { succeeded: false, ownerType: null, assigned: false, queued: false };
      }
    },
  };
}
