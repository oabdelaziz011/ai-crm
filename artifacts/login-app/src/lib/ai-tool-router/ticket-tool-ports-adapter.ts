import type { SupabaseClient } from "@supabase/supabase-js";
import { createTicketAgentToolPortsFromPlatform } from "@workspace/ai-tool-router";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import { createLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-platform-factory";

export function createLoginAppTicketToolPorts(client: SupabaseClient, companyId?: string) {
  const platform = createLoginAppTicketPlatformServices(client);
  const ports = createTicketAgentToolPortsFromPlatform(platform);
  if (!companyId) return ports;

  const wrap =
    <T extends (...args: never[]) => Promise<unknown>>(fn: T): T =>
    (async (...args: Parameters<T>) => {
      await requireCompanyFeature(client, companyId, "ticketing");
      await requireCompanyFeature(client, companyId, "ai_ticketing");
      return fn(...args);
    }) as T;

  return {
    createTicket: wrap(ports.createTicket.bind(ports)),
    updateTicket: wrap(ports.updateTicket.bind(ports)),
    closeTicket: wrap(ports.closeTicket.bind(ports)),
    assignTicket: wrap(ports.assignTicket.bind(ports)),
    addTicketComment: wrap(ports.addTicketComment.bind(ports)),
    changeTicketPriority: wrap(ports.changeTicketPriority.bind(ports)),
    changeTicketStatus: wrap(ports.changeTicketStatus.bind(ports)),
    searchTickets: wrap(ports.searchTickets.bind(ports)),
  };
}
