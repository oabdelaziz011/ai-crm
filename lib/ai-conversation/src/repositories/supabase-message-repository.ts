import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageRepository } from "./message-repository.js";
import type {
  AddMessageInput,
  ConversationMessageRecord,
  ListMessagesFilter,
} from "../types.js";
import { buildMessageSearchText } from "../message-cache.js";
import { DuplicateExternalMessageError } from "../errors.js";
import { traceTranscriptMessageStageBridge } from "../debug/omni-transcript-messages-bridge.js";
import { traceOmniSendBridgeAsync } from "../debug/omni-send-bridge.js";
import { chronologicalFromLatestWindow } from "./message-list-window.js";

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
      return traceOmniSendBridgeAsync(
        {
          layer: 5,
          stage: "Repository.conversation_messages.insert",
          file: "supabase-message-repository.ts",
          function: "add",
          line: 41,
          conversationId: input.conversationId,
          messageId: null,
          statusBefore: input.status ?? "pending",
          extra: { messageType: input.messageType },
        },
        async () => {
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
        (result) => ({
          messageId: result.id,
          statusAfter: result.status,
          extra: {
            externalMessageId: result.external_message_id,
            databaseInsert: true,
          },
        }),
      );
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
      const limit = filter.limit;
      const offset = filter.offset ?? 0;

      if (limit == null) {
        const { data, error } = await client
          .from(TABLE)
          .select("*")
          .eq("conversation_id", filter.conversationId)
          .order("sequence_number", { ascending: true })
          .order("created_at", { ascending: true });

        if (error) throw error;
        const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
        traceTranscriptMessageStageBridge({
          stage: "Supabase.conversation_messages.select",
          file: "supabase-message-repository.ts",
          function: "list",
          line: 135,
          conversationId: filter.conversationId,
          sqlWhere: `conversation_id = '${filter.conversationId}'`,
          orderBy: "sequence_number ASC, created_at ASC",
          limit: null,
          rows: rows.map((row) => ({
            id: row.id,
            created_at: row.created_at,
            message_type: row.message_type,
            content: row.content,
          })),
        });
        return rows;
      }

      let query = client
        .from(TABLE)
        .select("*")
        .eq("conversation_id", filter.conversationId)
        .order("sequence_number", { ascending: false })
        .order("created_at", { ascending: false });

      query =
        filter.offset != null
          ? query.range(offset, offset + limit - 1)
          : query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      const newestFirst = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
      const rows = chronologicalFromLatestWindow(newestFirst);
      traceTranscriptMessageStageBridge({
        stage: "Supabase.conversation_messages.select",
        file: "supabase-message-repository.ts",
        function: "list",
        line: 165,
        conversationId: filter.conversationId,
        sqlWhere: `conversation_id = '${filter.conversationId}'`,
        orderBy: "sequence_number DESC, created_at DESC → reversed to ASC",
        limit,
        rows: rows.map((row) => ({
          id: row.id,
          created_at: row.created_at,
          message_type: row.message_type,
          content: row.content,
        })),
        extra: { offset: filter.offset ?? null },
      });
      return rows;
    },
  };
}
