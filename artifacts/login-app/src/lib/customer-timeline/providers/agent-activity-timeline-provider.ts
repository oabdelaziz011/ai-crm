import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import {
  fetchActorNames,
  fetchCustomerConversationIds,
  truncateText,
} from "../provider-utils";

/**
 * Operational agent Activity only:
 * - internal notes on conversations owned by company_id + customer_id
 *
 * Does NOT read audit_logs (History owns those).
 * Does NOT synthesize profile-update events from current customer row timestamps.
 */
export class AgentActivityTimelineProvider implements TimelineEventProvider {
  readonly providerId = "agent-activity";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    if (!companyId?.trim() || !customerId?.trim()) return [];

    const conversationIds = await fetchCustomerConversationIds(
      customerId,
      undefined,
      companyId,
    );
    if (conversationIds.length === 0) return [];

    const { data: internalNotes } = await supabase
      .from("conversation_messages")
      .select("id, conversation_id, content, created_at, created_by")
      .in("conversation_id", conversationIds)
      .eq("message_type", "internal_note")
      .order("created_at", { ascending: false })
      .limit(100);

    const noteActorIds = (internalNotes ?? []).map((note) => note.created_by ?? "");
    const actorNames = await fetchActorNames(noteActorIds);
    const events: TimelineEvent[] = [];

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

    return events;
  }
}
