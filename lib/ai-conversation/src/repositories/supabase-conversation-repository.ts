import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRepository } from "./conversation-repository.js";
import type {
  ApplyMessageCacheInput,
  ApplyStateTransitionInput,
  AssignConversationInput,
  CloseConversationInput,
  ConversationRecord,
  CreateConversationInput,
  ListConversationsFilter,
  ReleaseConversationInput,
  UpdateConversationMetadataInput,
  UpdateConversationPriorityInput,
  UpdateConversationStateInput,
} from "../types.js";
import { buildConversationSearchText, resolveUnreadDelta } from "../message-cache.js";
import { ConversationNotFoundError, ConversationStateConflictError } from "../errors.js";

const OMNI_LIST_TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const OMNI_LIST_RT = "[OMNI_LIST]";

const TABLE = "conversations";

function mapRow(row: Record<string, unknown>): ConversationRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_number: row.conversation_number as string,
    company_channel_id: (row.company_channel_id as string | null) ?? null,
    ai_assistant_id: row.ai_assistant_id as string,
    channel_type: row.channel_type as ConversationRecord["channel_type"],
    channel_instance_id: (row.channel_instance_id as string | null) ?? null,
    state: row.state as ConversationRecord["state"],
    external_thread_id: (row.external_thread_id as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    assigned_user_id: (row.assigned_user_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    priority: (row.priority as ConversationRecord["priority"]) ?? "normal",
    locked_by: (row.locked_by as string | null) ?? null,
    locked_at: (row.locked_at as string | null) ?? null,
    unread_count_employee: Number(row.unread_count_employee ?? 0),
    unread_count_customer: Number(row.unread_count_customer ?? 0),
    last_message_at: (row.last_message_at as string | null) ?? null,
    last_message_preview: (row.last_message_preview as string | null) ?? null,
    last_participant_type: (row.last_participant_type as ConversationRecord["last_participant_type"]) ?? null,
    search_text: (row.search_text as string) ?? "",
    started_at: row.started_at as string,
    ended_at: (row.ended_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
  };
}

export function createSupabaseConversationRepository(client: SupabaseClient): ConversationRepository {
  return {
    async create(input: CreateConversationInput): Promise<ConversationRecord> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          company_id: input.companyId,
          ai_assistant_id: input.aiAssistantId,
          channel_type: input.channelType,
          channel_instance_id: input.channelInstanceId ?? null,
          external_thread_id: input.externalThreadId ?? null,
          customer_id: input.customerId ?? null,
          company_channel_id: input.companyChannelId ?? null,
          metadata: input.metadata ?? {},
          priority: input.priority ?? "normal",
          state: input.initialState ?? "idle",
          created_by: input.createdBy ?? null,
          updated_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<ConversationRecord | null> {
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

    async findByNumber(companyId: string, conversationNumber: string): Promise<ConversationRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_number", conversationNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapRow(data as Record<string, unknown>);
    },

    async list(filter: ListConversationsFilter): Promise<ConversationRecord[]> {
      let query = client
        .from(TABLE)
        .select("*", { count: "exact" })
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (filter.state) query = query.eq("state", filter.state);
      if (filter.channelType) query = query.eq("channel_type", filter.channelType);
      if (filter.priority) query = query.eq("priority", filter.priority);
      if (filter.hasEmployeeUnread) query = query.gt("unread_count_employee", 0);
      if (filter.hasCustomerUnread) query = query.gt("unread_count_customer", 0);
      if (filter.searchQuery?.trim()) {
        query = query.ilike("search_text", `%${filter.searchQuery.trim()}%`);
      }
      if (filter.assignedUserId !== undefined) {
        if (filter.assignedUserId === null) {
          query = query.is("assigned_user_id", null);
        } else {
          query = query.eq("assigned_user_id", filter.assignedUserId);
        }
      }
      if (filter.limit != null) query = query.limit(filter.limit);
      if (filter.offset != null) {
        const limit = filter.limit ?? 50;
        query = query.range(filter.offset, filter.offset + limit - 1);
      }

      const supabaseFilters = {
        companyId: filter.companyId,
        searchQuery: filter.searchQuery,
        state: filter.state,
        assignedUserId: filter.assignedUserId,
        archived: undefined as boolean | undefined,
        channelType: filter.channelType,
        pageSize: filter.limit ?? 50,
        page: filter.offset != null ? Math.floor(filter.offset / (filter.limit ?? 50)) : 0,
        offset: filter.offset ?? 0,
        priority: filter.priority,
        hasEmployeeUnread: filter.hasEmployeeUnread,
        hasCustomerUnread: filter.hasCustomerUnread,
        deletedAt: "IS NULL",
        orderBy: "last_message_at DESC NULLS LAST, created_at DESC",
      };

      const postgrestFilter = {
        table: TABLE,
        select: "*",
        eq: { company_id: filter.companyId, deleted_at: null },
        optionalEq: {
          ...(filter.state ? { state: filter.state } : {}),
          ...(filter.channelType ? { channel_type: filter.channelType } : {}),
          ...(filter.priority ? { priority: filter.priority } : {}),
        },
        optionalGt: {
          ...(filter.hasEmployeeUnread ? { unread_count_employee: 0 } : {}),
          ...(filter.hasCustomerUnread ? { unread_count_customer: 0 } : {}),
        },
        optionalIlike: filter.searchQuery?.trim()
          ? { search_text: `%${filter.searchQuery.trim()}%` }
          : undefined,
        assignedUserId: filter.assignedUserId,
        order: ["last_message_at.desc.nullslast", "created_at.desc"],
        range:
          filter.offset != null
            ? { from: filter.offset, to: filter.offset + (filter.limit ?? 50) - 1 }
            : filter.limit != null
              ? { from: 0, to: filter.limit - 1 }
              : null,
        sqlEquivalent: [
          "SELECT * FROM conversations",
          `WHERE company_id = '${filter.companyId}' AND deleted_at IS NULL`,
          filter.state ? `AND state = '${filter.state}'` : null,
          filter.channelType ? `AND channel_type = '${filter.channelType}'` : null,
          filter.priority ? `AND priority = '${filter.priority}'` : null,
          filter.hasEmployeeUnread ? "AND unread_count_employee > 0" : null,
          filter.hasCustomerUnread ? "AND unread_count_customer > 0" : null,
          filter.searchQuery?.trim() ? `AND search_text ILIKE '%${filter.searchQuery.trim()}%'` : null,
          filter.assignedUserId === null ? "AND assigned_user_id IS NULL" : null,
          filter.assignedUserId ? `AND assigned_user_id = '${filter.assignedUserId}'` : null,
          "ORDER BY last_message_at DESC NULLS LAST, created_at DESC",
          filter.offset != null
            ? `LIMIT ${filter.limit ?? 50} OFFSET ${filter.offset}`
            : filter.limit != null
              ? `LIMIT ${filter.limit}`
              : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };

      const sessionEmail =
        typeof client.auth?.getSession === "function"
          ? (await client.auth.getSession()).data.session?.user?.email ?? null
          : null;

      console.info("[OMNI_SESSION_PROBE]", "listConversations.beforeQuery", {
        companyId: filter.companyId,
        userEmail: sessionEmail,
        postgrestFilter,
        supabaseFilters,
      });

      if (typeof globalThis !== "undefined") {
        const w = globalThis as unknown as {
          __OMNI_SESSION_PROBE__?: {
            authBootstrap: unknown;
            listConversations: unknown[];
          };
        };
        w.__OMNI_SESSION_PROBE__ ??= { authBootstrap: null, listConversations: [] };
        w.__OMNI_SESSION_PROBE__.listConversations.push({
          at: new Date().toISOString(),
          companyId: filter.companyId,
          userEmail: sessionEmail,
          postgrestFilter,
        });
      }

      const { data, error, status, statusText, count } = await query;
      const rawData = data ?? [];
      const rows = rawData.map((row) => mapRow(row as Record<string, unknown>));
      const targetIndex = rows.findIndex((r) => r.id === OMNI_LIST_TARGET_ID);
      const targetRaw = rawData.find((row) => (row as { id?: string }).id === OMNI_LIST_TARGET_ID);
      const first10RawIds = rawData
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => typeof id === "string")
        .slice(0, 10);

      console.info(OMNI_LIST_RT, "supabase.list.raw_response.beforeMap", {
        status,
        statusText,
        error: error?.message ?? null,
        responseCount: count ?? null,
        dataLength: rawData.length,
        first10Ids: first10RawIds,
        targetInRawData: targetRaw != null,
        targetInRawDataIndex: targetRaw
          ? rawData.findIndex((row) => (row as { id?: string }).id === OMNI_LIST_TARGET_ID)
          : null,
        supabaseFilters,
      });

      if (typeof globalThis !== "undefined") {
        const w = globalThis as unknown as {
          __OMNI_LIST_PIPELINE__?: {
            rawSupabase: {
              at: string;
              status: number | null;
              error: string | null;
              responseCount: number | null;
              dataLength: number;
              first10Ids: string[];
              targetInRawData: boolean;
              targetInRawDataIndex: number | null;
              targetInMappedRows: boolean;
              targetInMappedRowsIndex: number | null;
            } | null;
            stages: unknown[];
            firstRemoval: unknown;
          };
        };
        w.__OMNI_LIST_PIPELINE__ ??= { rawSupabase: null, stages: [], firstRemoval: null };
        w.__OMNI_LIST_PIPELINE__.rawSupabase = {
          at: new Date().toISOString(),
          status: status ?? null,
          error: error?.message ?? null,
          responseCount: count ?? null,
          dataLength: rawData.length,
          first10Ids: first10RawIds,
          targetInRawData: targetRaw != null,
          targetInRawDataIndex: targetRaw
            ? rawData.findIndex((row) => (row as { id?: string }).id === OMNI_LIST_TARGET_ID)
            : null,
          targetInMappedRows: targetIndex >= 0,
          targetInMappedRowsIndex: targetIndex >= 0 ? targetIndex : null,
        };
      }

      console.info(OMNI_LIST_RT, "supabase.list.raw_response", {
        status,
        statusText,
        error: error?.message ?? null,
        supabaseFilters,
        rowCount: rows.length,
        targetPresent: targetIndex >= 0,
        targetIndex: targetIndex >= 0 ? targetIndex : null,
        targetObject: targetRaw ?? null,
        top3: rows.slice(0, 3).map((r) => ({
          id: r.id,
          conversation_number: r.conversation_number,
          last_message_at: r.last_message_at,
        })),
      });

      if (typeof globalThis !== "undefined") {
        const w = globalThis as unknown as { __OMNI_LIST_LOGS?: unknown[] };
        w.__OMNI_LIST_LOGS ??= [];
        w.__OMNI_LIST_LOGS.push({
          at: new Date().toISOString(),
          stage: "supabase.list.raw_response",
          targetId: OMNI_LIST_TARGET_ID,
          present: targetIndex >= 0,
          index: targetIndex >= 0 ? targetIndex : undefined,
          detail: { supabaseFilters, rowCount: rows.length, targetObject: targetRaw ?? null },
        });
      }

      if (error) throw error;
      return rows;
    },

    async close(input: CloseConversationInput): Promise<ConversationRecord> {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from(TABLE)
        .update({
          state: "closed",
          ended_at: now,
          updated_by: input.updatedBy ?? null,
        })
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async assign(input: AssignConversationInput): Promise<ConversationRecord> {
      const patch: Record<string, unknown> = {
        assigned_user_id: input.assignedUserId,
        updated_by: input.updatedBy ?? null,
      };
      if (input.state) patch.state = input.state;

      const { data, error } = await client
        .from(TABLE)
        .update(patch)
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async release(input: ReleaseConversationInput): Promise<ConversationRecord> {
      const patch: Record<string, unknown> = {
        assigned_user_id: null,
        updated_by: input.updatedBy ?? null,
      };
      if (input.state) patch.state = input.state;

      const { data, error } = await client
        .from(TABLE)
        .update(patch)
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async updateState(input: UpdateConversationStateInput): Promise<ConversationRecord> {
      const patch: Record<string, unknown> = {
        state: input.state,
        updated_by: input.updatedBy ?? null,
      };
      if (input.state === "closed") {
        patch.ended_at = new Date().toISOString();
      }

      const { data, error } = await client
        .from(TABLE)
        .update(patch)
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async updatePriority(input: UpdateConversationPriorityInput): Promise<ConversationRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          priority: input.priority,
          updated_by: input.updatedBy ?? null,
        })
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async updateMetadata(input: UpdateConversationMetadataInput): Promise<ConversationRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          metadata: input.metadata,
          updated_by: input.updatedBy ?? null,
        })
        .eq("id", input.conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(input.conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async applyMessageCache(input: ApplyMessageCacheInput): Promise<void> {
      const unreadDelta = resolveUnreadDelta(input.messageType);
      const searchText = buildConversationSearchText([
        input.conversationNumber,
        input.externalThreadId,
        input.preview,
      ]);

      const { error } = await client
        .from(TABLE)
        .update({
          last_message_at: input.messageAt,
          last_message_preview: input.preview,
          last_participant_type: input.participantType,
          search_text: searchText,
          unread_count_employee: input.currentUnreadEmployee + unreadDelta.employee,
          unread_count_customer: input.currentUnreadCustomer + unreadDelta.customer,
        })
        .eq("id", input.conversationId)
        .is("deleted_at", null);

      if (error) throw error;
    },

    async resetEmployeeUnread(conversationId: string, updatedBy?: string | null): Promise<ConversationRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          unread_count_employee: 0,
          updated_by: updatedBy ?? null,
        })
        .eq("id", conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async resetCustomerUnread(conversationId: string, updatedBy?: string | null): Promise<ConversationRecord> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          unread_count_customer: 0,
          updated_by: updatedBy ?? null,
        })
        .eq("id", conversationId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new ConversationNotFoundError(conversationId);
      return mapRow(data as Record<string, unknown>);
    },

    async applyStateTransition(input: ApplyStateTransitionInput): Promise<ConversationRecord> {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        state: input.toState,
        metadata: input.metadata,
        updated_by: input.updatedBy ?? null,
      };
      if (input.toState === "closed") {
        patch.ended_at = now;
      }

      const { data, error } = await client
        .from(TABLE)
        .update(patch)
        .eq("id", input.conversationId)
        .eq("state", input.fromState)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) {
        const current = await this.findById(input.conversationId);
        if (!current) throw new ConversationNotFoundError(input.conversationId);
        throw new ConversationStateConflictError(input.fromState, current.state);
      }

      return mapRow(data as Record<string, unknown>);
    },

    async touchLastMessageAt(conversationId: string, at?: string): Promise<void> {
      const { error } = await client
        .from(TABLE)
        .update({
          last_message_at: at ?? new Date().toISOString(),
        })
        .eq("id", conversationId)
        .is("deleted_at", null);

      if (error) throw error;
    },

    async resolveCompanyChannel(companyChannelId: string) {
      const { data, error } = await client
        .from("company_channels")
        .select("company_id, is_enabled, communication_channels(key)")
        .eq("id", companyChannelId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      const embedded = row.communication_channels;
      const channelRow = Array.isArray(embedded) ? embedded[0] : embedded;
      const channelKey = (channelRow as Record<string, unknown> | undefined)?.key;

      if (typeof channelKey !== "string") return null;

      return {
        companyId: row.company_id as string,
        channelKey: channelKey as ConversationRecord["channel_type"],
        isEnabled: Boolean(row.is_enabled),
      };
    },
  };
}
