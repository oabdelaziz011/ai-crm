import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageRepository } from "./message-repository.js";
import type {
  AddMessageInput,
  ConversationMessageRecord,
  ListMessagesFilter,
} from "../types.js";
import { buildMessageSearchText } from "../message-cache.js";
import { DuplicateExternalMessageError } from "../errors.js";

const TABLE = "conversation_messages";

function mapRow(row: Record<string, unknown>): ConversationMessageRecord {
  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    participant_id: (row.participant_id as string | null) ?? null,
    sequence_number: Number(row.sequence_number ?? 0),
    message_type: row.message_type as ConversationMessageRecord["message_type"],
    content_type: row.content_type as ConversationMessageRecord["content_type"],
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    status: row.status as ConversationMessageRecord["status"],
    external_message_id: (row.external_message_id as string | null) ?? null,
    attachment_type: (row.attachment_type as string | null) ?? null,
    attachment_url: (row.attachment_url as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    file_size: row.file_size == null ? null : Number(row.file_size),
    search_text: (row.search_text as string) ?? "",
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function isDuplicateExternalMessageError(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" && (error.message?.includes("idx_conversation_messages_external_id") ?? false);
}

export function createSupabaseMessageRepository(client: SupabaseClient): MessageRepository {
  return {
    async add(input: AddMessageInput): Promise<ConversationMessageRecord> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          conversation_id: input.conversationId,
          participant_id: input.participantId ?? null,
          message_type: input.messageType,
          content_type: input.contentType ?? "text",
          content: input.content,
          metadata: input.metadata ?? {},
          status: input.status ?? "pending",
          external_message_id: input.externalMessageId ?? null,
          attachment_type: input.attachmentType ?? null,
          attachment_url: input.attachmentUrl ?? null,
          mime_type: input.mimeType ?? null,
          file_size: input.fileSize ?? null,
          search_text: buildMessageSearchText(input.content),
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) {
        if (isDuplicateExternalMessageError(error) && input.externalMessageId) {
          throw new DuplicateExternalMessageError(input.externalMessageId);
        }
        throw error;
      }
      return mapRow(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<ConversationMessageRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async findByConversationAndExternalMessageId(conversationId, externalMessageId) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("external_message_id", externalMessageId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async list(filter: ListMessagesFilter): Promise<ConversationMessageRecord[]> {
      let query = client
        .from(TABLE)
        .select("*")
        .eq("conversation_id", filter.conversationId)
        .order("sequence_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (filter.limit != null) query = query.limit(filter.limit);
      if (filter.offset != null) {
        const limit = filter.limit ?? 100;
        query = query.range(filter.offset, filter.offset + limit - 1);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
  };
}
