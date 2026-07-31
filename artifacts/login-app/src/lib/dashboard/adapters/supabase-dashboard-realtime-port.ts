import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardRealtimeConnectionState,
  DashboardRealtimeEvent,
  DashboardRealtimeEventType,
} from "@workspace/dashboard-engine";
import type { DashboardRealtimeEventPort, DashboardRealtimeEventPortOptions } from "@workspace/dashboard-engine";
import { supabase } from "@/lib/supabase";

type TableBinding = {
  table: string;
  eventType: DashboardRealtimeEventType;
  module: DashboardRealtimeEvent["module"];
  filterColumn?: string;
};

const DASHBOARD_REALTIME_BINDINGS: TableBinding[] = [
  { table: "customers", eventType: "customer_updated", module: "crm" },
  { table: "invoices", eventType: "invoice_created", module: "finance" },
  { table: "scheduling_bookings", eventType: "booking_updated", module: "bookings" },
  { table: "conversations", eventType: "conversation_started", module: "support" },
  { table: "automation_executions", eventType: "workflow_completed", module: "automation" },
  { table: "tool_executions", eventType: "tool_execution", module: "ai" },
  { table: "retrieval_executions", eventType: "retrieval_completed", module: "knowledge" },
  { table: "whatsapp_delivery_logs", eventType: "whatsapp_message", module: "channels" },
  { table: "email_delivery_logs", eventType: "email_received", module: "channels" },
];

function normalizeBindingEvent(
  binding: TableBinding,
  payload: Record<string, unknown>,
): DashboardRealtimeEventType {
  if (binding.table === "customers") {
    if (payload.eventType === "DELETE") return "customer_deleted";
    if (payload.eventType === "INSERT") return "customer_created";
    return "customer_updated";
  }
  if (binding.table === "invoices") {
    if (payload.eventType === "INSERT") return "invoice_created";
    return "invoice_paid";
  }
  if (binding.table === "scheduling_bookings") {
    if (payload.eventType === "INSERT") return "booking_created";
    if (payload.eventType === "DELETE") return "booking_cancelled";
    return "booking_updated";
  }
  if (binding.table === "conversations") {
    return binding.eventType;
  }
  if (binding.table === "automation_executions") {
    return payload.status === "failed" ? "workflow_failed" : binding.eventType;
  }
  return binding.eventType;
}

export function createSupabaseDashboardRealtimePort(
  client: SupabaseClient = supabase,
): DashboardRealtimeEventPort {
  const connectionState = new Map<string, DashboardRealtimeConnectionState>();
  const channels = new Map<string, ReturnType<SupabaseClient["channel"]>>();

  return {
    async subscribe(companyId, listener, options?: DashboardRealtimeEventPortOptions) {
      const channelName = `dashboard:${companyId}`;
      let channel = client.channel(channelName);

      for (const binding of DASHBOARD_REALTIME_BINDINGS) {
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: binding.table,
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            const eventType = normalizeBindingEvent(binding, payload as Record<string, unknown>);
            listener({
              id: `${binding.table}-${payload.commit_timestamp ?? Date.now()}`,
              type: eventType,
              module: binding.module,
              companyId,
              occurredAt: new Date().toISOString(),
              source: binding.table,
              payload: {
                eventType: String(payload.eventType ?? ""),
              },
            });
          },
        );
      }

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          connectionState.set(companyId, "connected");
          options?.onConnectionChange?.("connected");
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          connectionState.set(companyId, "disconnected");
          options?.onConnectionChange?.("disconnected");
        }
      });

      channels.set(companyId, channel);
      return () => {
        void client.removeChannel(channel);
        channels.delete(companyId);
        connectionState.set(companyId, "disconnected");
      };
    },

    async reconnect(companyId) {
      const existing = channels.get(companyId);
      if (existing) {
        await client.removeChannel(existing);
        channels.delete(companyId);
      }
      connectionState.set(companyId, "reconnecting");
    },

    pulse(companyId) {
      if (connectionState.get(companyId) !== "connected") {
        connectionState.set(companyId, "disconnected");
      }
    },

    getConnectionState(companyId) {
      return connectionState.get(companyId) ?? "disconnected";
    },
  };
}
