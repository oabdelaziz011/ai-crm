import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import {
  fetchActorNames,
  fetchCustomerConversationIds,
  truncateText,
} from "../provider-utils";

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function readMetadataEvents(metadata: Record<string, unknown>): string[] {
  const events = metadata.events;
  if (!Array.isArray(events)) return [];
  return events.filter((entry): entry is string => typeof entry === "string");
}

export class AgentActivityTimelineProvider implements TimelineEventProvider {
  readonly providerId = "agent-activity";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, notes, created_at, updated_at")
      .eq("id", customerId)
      .maybeSingle();

    if (!customerError && customer) {
      if (customer.notes?.trim()) {
        const notesUpdated =
          new Date(customer.updated_at).getTime() > new Date(customer.created_at).getTime() + 60_000;
        if (notesUpdated) {
          events.push({
            id: `${this.providerId}:note:${customer.id}:${customer.updated_at}`,
            type: "note_added",
            occurredAt: customer.updated_at,
            source: this.providerId,
            payload: { customerId: customer.id },
            metadata: {
              detail: truncateText(customer.notes),
              searchText: ["note", customer.notes].join(" "),
              filterGroup: "notes",
            },
          });
        }
      }

      const profileUpdated =
        new Date(customer.updated_at).getTime() > new Date(customer.created_at).getTime() + 60_000;
      if (profileUpdated) {
        events.push({
          id: `${this.providerId}:updated:${customer.id}:${customer.updated_at}`,
          type: "customer_updated",
          occurredAt: customer.updated_at,
          source: this.providerId,
          payload: { customerId: customer.id },
          metadata: {
            detail: customer.name,
            searchText: ["customer updated", customer.name].join(" "),
          },
        });
      }
    }

    const conversationIds = await fetchCustomerConversationIds(customerId);
    if (conversationIds.length > 0) {
      const { data: internalNotes } = await supabase
        .from("conversation_messages")
        .select("id, conversation_id, content, created_at, created_by")
        .in("conversation_id", conversationIds)
        .eq("message_type", "internal_note")
        .order("created_at", { ascending: false })
        .limit(100);

      const noteActorIds = (internalNotes ?? []).map((note) => note.created_by ?? "");
      const actorNames = await fetchActorNames(noteActorIds);

      for (const note of internalNotes ?? []) {
        const actor = note.created_by ? actorNames.get(note.created_by) ?? null : null;
        events.push({
          id: `${this.providerId}:internal-note:${note.id}`,
          type: "note_added",
          occurredAt: note.created_at,
          source: this.providerId,
          payload: { messageId: note.id, conversationId: note.conversation_id },
          metadata: {
            actor,
            actorId: note.created_by,
            detail: truncateText(note.content),
            searchText: ["note", note.content, actor].filter(Boolean).join(" "),
            filterGroup: "notes",
          },
        });
      }

      let auditQuery = supabase
        .from("audit_logs")
        .select("id, user_id, action, entity, entity_id, metadata, created_at")
        .eq("entity", "conversations")
        .in("entity_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (companyId) {
        auditQuery = auditQuery.eq("company_id", companyId);
      }

      const { data: auditRows } = await auditQuery;
      const auditActorNames = await fetchActorNames(
        (auditRows ?? []).map((row) => row.user_id ?? ""),
      );

      for (const row of (auditRows ?? []) as AuditRow[]) {
        const auditEvents = readMetadataEvents(row.metadata ?? {});
        const actor = row.user_id ? auditActorNames.get(row.user_id) ?? null : null;
        const conversationNumber =
          typeof row.metadata?.conversation_number === "string"
            ? row.metadata.conversation_number
            : null;

        if (auditEvents.includes("conversation_closed")) {
          events.push({
            id: `${this.providerId}:closed:${row.id}`,
            type: "conversation_closed",
            occurredAt: row.created_at,
            source: this.providerId,
            payload: { conversationId: row.entity_id, auditLogId: row.id },
            metadata: {
              actor,
              actorId: row.user_id,
              detail: conversationNumber,
              searchText: ["conversation closed", conversationNumber, actor]
                .filter(Boolean)
                .join(" "),
            },
          });
        }

        const oldState =
          row.metadata?.old &&
          typeof row.metadata.old === "object" &&
          !Array.isArray(row.metadata.old)
            ? (row.metadata.old as Record<string, unknown>).state
            : null;
        const newState =
          row.metadata?.new &&
          typeof row.metadata.new === "object" &&
          !Array.isArray(row.metadata.new)
            ? (row.metadata.new as Record<string, unknown>).state
            : null;

        if (
          auditEvents.includes("state_changed") &&
          oldState === "closed" &&
          typeof newState === "string" &&
          newState !== "closed"
        ) {
          events.push({
            id: `${this.providerId}:reopened:${row.id}`,
            type: "conversation_reopened",
            occurredAt: row.created_at,
            source: this.providerId,
            payload: { conversationId: row.entity_id, auditLogId: row.id },
            metadata: {
              actor,
              actorId: row.user_id,
              detail: conversationNumber,
              searchText: ["conversation reopened", conversationNumber, actor]
                .filter(Boolean)
                .join(" "),
            },
          });
        }
      }
    }

    const customerAuditQuery = supabase
      .from("audit_logs")
      .select("id, user_id, action, entity, entity_id, metadata, created_at")
      .eq("entity", "customers")
      .eq("entity_id", customerId)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: customerAuditRows } = companyId
      ? await customerAuditQuery.eq("company_id", companyId)
      : await customerAuditQuery;

    const customerAuditActors = await fetchActorNames(
      (customerAuditRows ?? []).map((row) => row.user_id ?? ""),
    );

    for (const row of (customerAuditRows ?? []) as AuditRow[]) {
      const actor = row.user_id ? customerAuditActors.get(row.user_id) ?? null : null;

      if (row.action === "UPDATE") {
        events.push({
          id: `${this.providerId}:audit-updated:${row.id}`,
          type: "customer_updated",
          occurredAt: row.created_at,
          source: this.providerId,
          payload: { auditLogId: row.id },
          metadata: {
            actor,
            actorId: row.user_id,
            searchText: ["customer updated", actor].filter(Boolean).join(" "),
          },
        });
      }
    }

    return events;
  }
}
