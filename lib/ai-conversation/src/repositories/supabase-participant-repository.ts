import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipantRepository } from "./participant-repository.js";
import type { AddParticipantInput, ConversationParticipantRecord } from "../types.js";
import { ParticipantNotFoundError } from "../errors.js";

const TABLE = "conversation_participants";

function mapRow(row: Record<string, unknown>): ConversationParticipantRecord {
  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    participant_type: row.participant_type as ConversationParticipantRecord["participant_type"],
    display_name: (row.display_name as string | null) ?? null,
    profile_ref: (row.profile_ref as string | null) ?? null,
    external_participant_id: (row.external_participant_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
  };
}

export function createSupabaseParticipantRepository(client: SupabaseClient): ParticipantRepository {
  return {
    async add(input: AddParticipantInput): Promise<ConversationParticipantRecord> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          conversation_id: input.conversationId,
          participant_type: input.participantType,
          display_name: input.displayName ?? null,
          profile_ref: input.profileRef ?? null,
          external_participant_id: input.externalParticipantId ?? null,
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
          updated_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<ConversationParticipantRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async listByConversation(conversationId: string): Promise<ConversationParticipantRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },

    async remove(participantId: string, removedBy?: string | null): Promise<ConversationParticipantRecord> {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from(TABLE)
        .update({
          deleted_at: now,
          deleted_by: removedBy ?? null,
          updated_by: removedBy ?? null,
        })
        .eq("id", participantId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ParticipantNotFoundError(participantId);
      return mapRow(data as Record<string, unknown>);
    },
  };
}
