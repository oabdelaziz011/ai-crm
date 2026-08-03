import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_WORKFLOW_EVENTS,
  createAppointmentPlatformServices,
  type AppointmentDomainEvent,
  type AppointmentEventPublisherPort,
  type AppointmentIdentityPort,
  type AppointmentPlatformServices,
} from "@workspace/appointment-platform";
import { dispatchAutomationEvent } from "@/lib/automation";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";
import type { WebhookEventType } from "@/lib/integration/types";
import { createSchedulingEngines, BookingDomainService } from "@workspace/scheduling-engine";

const APPOINTMENT_WEBHOOK_EVENT_MAP: Partial<Record<string, WebhookEventType>> = {
  appointment_created: "booking.created",
  appointment_updated: "booking.updated",
  appointment_cancelled: "booking.cancelled",
  appointment_completed: "booking.completed",
  appointment_confirmed: "booking.updated",
  appointment_rescheduled: "booking.updated",
  appointment_no_show: "booking.updated",
  appointment_checked_in: "booking.updated",
  appointment_resource_assigned: "booking.updated",
};

/** Legacy automation workflows listen on booking.* — preserve zero regression. */
const APPOINTMENT_AUTOMATION_EVENT_MAP: Partial<Record<string, string>> = {
  appointment_created: "booking.created",
  appointment_updated: "booking.updated",
  appointment_cancelled: "booking.cancelled",
  appointment_completed: "booking.completed",
  appointment_confirmed: "booking.updated",
  appointment_rescheduled: "booking.updated",
  appointment_no_show: "booking.updated",
  appointment_checked_in: "booking.updated",
  appointment_resource_assigned: "booking.updated",
};

export function createAppointmentEventBridge(): AppointmentEventPublisherPort {
  return {
    async publish(event: AppointmentDomainEvent): Promise<void> {
      const automationEventName =
        APPOINTMENT_AUTOMATION_EVENT_MAP[event.type] ?? APPOINTMENT_WORKFLOW_EVENTS[event.type];
      await dispatchAutomationEvent({
        name: automationEventName,
        companyId: event.companyId,
        params: { appointmentId: event.appointmentId, ...event.payload },
        userId: typeof event.payload.actorUserId === "string" ? event.payload.actorUserId : undefined,
      });

      const webhookType = APPOINTMENT_WEBHOOK_EVENT_MAP[event.type];
      if (webhookType) {
        await getEnterpriseEventPublisher().publish({
          companyId: event.companyId,
          eventType: webhookType,
          eventId: `${event.appointmentId}:${webhookType}:${event.occurredAt}`,
          payload: { appointmentId: event.appointmentId, eventType: event.type, ...event.payload },
        });
      }
    },
  };
}

export function createLoginAppAppointmentIdentityPort(client: SupabaseClient): AppointmentIdentityPort {
  return {
    async resolveCustomerId(input) {
      if (input.customerId?.trim()) return input.customerId.trim();

      if (input.leadId) {
        const { data, error } = await client
          .from("leads")
          .select("customer_id")
          .eq("company_id", input.companyId)
          .eq("id", input.leadId)
          .is("deleted_at", null)
          .maybeSingle();

        if (!error && data?.customer_id) {
          return String(data.customer_id);
        }
      }

      if (input.conversationId) {
        const { data, error } = await client
          .from("conversations")
          .select("customer_id")
          .eq("company_id", input.companyId)
          .eq("id", input.conversationId)
          .maybeSingle();

        if (!error && data?.customer_id) {
          return String(data.customer_id);
        }
      }

      throw new Error("customerId is required — convert lead or link customer before creating an appointment.");
    },
  };
}

export function createLoginAppAppointmentPlatformServices(client: SupabaseClient): AppointmentPlatformServices {
  const { availabilityEngine, slotGenerationEngine } = createSchedulingEngines(client);
  const bookingDomain = new BookingDomainService(client, slotGenerationEngine);

  return createAppointmentPlatformServices(client, {
    events: createAppointmentEventBridge(),
    identity: createLoginAppAppointmentIdentityPort(client),
    bookingDomainStack: {
      availabilityEngine,
      slotGenerationEngine,
      bookingDomain,
    },
  });
}