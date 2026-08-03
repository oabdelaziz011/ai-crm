import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomer360Loader, createSupabaseCustomer360DataPort } from "@workspace/customer-360";
import { createKnowledgeRuntimeProvider } from "@workspace/knowledge-runtime";
import type { RetrievalServices } from "@workspace/retrieval-engine";
import type { RuntimeEnginePortOptions } from "@workspace/runtime-integration";
import { createLoginAppTicketReadPort } from "@/lib/ticket-platform/ticket-read-port-adapter";
import { createLoginAppLeadReadPort } from "@/lib/lead-platform/lead-read-port-adapter";
import { createLoginAppAppointmentReadPort } from "@/lib/appointment-platform/appointment-read-port-adapter";

export function createDashboardRuntimeEnginePortOptions(
  client: SupabaseClient,
  retrieval: RetrievalServices,
  resolveActorUserId?: (companyId: string) => Promise<string | null>,
): RuntimeEnginePortOptions {
  return {
    promptMode: "dashboard",
    customer360Loader: createCustomer360Loader(
      createSupabaseCustomer360DataPort(client, {
        resolveActorUserIdForCompany: resolveActorUserId ?? (async () => null),
        ticketReads: createLoginAppTicketReadPort(client),
        leadReads: createLoginAppLeadReadPort(client),
        appointmentReads: createLoginAppAppointmentReadPort(client),
      }),
    ),
    knowledgeRuntimeProvider: createKnowledgeRuntimeProvider(retrieval.knowledge),
    resolveActorUserId,
  };
}
