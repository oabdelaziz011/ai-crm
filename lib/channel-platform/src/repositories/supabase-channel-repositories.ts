import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WA_REQUEST_CACHE_NS,
  waRequestCacheSet,
  waRequestGetOrLoad,
} from "../debug/whatsapp-request-scope.js";
import type {
  ChannelDeliveryEventRepository,
  ChannelInboundEventRepository,
  ChannelSessionRepository,
  CreateDeliveryEventInput,
  CreateInboundEventInput,
  ResolveSessionInput,
  UpdateDeliveryEventInput,
  UpdateInboundEventInput,
} from "./channel-platform-repositories.js";
import type {
  ChannelDeliveryEventRecord,
  ChannelInboundEventRecord,
  ChannelSessionRecord,
} from "../types.js";

function sessionCacheKey(companyChannelId: string, externalThreadId: string): string {
  return `${companyChannelId}:${externalThreadId}`;
}

function rememberSession(session: ChannelSessionRecord): void {
  waRequestCacheSet(
    WA_REQUEST_CACHE_NS.session,
    sessionCacheKey(session.company_channel_id, session.external_thread_id),
    session,
  );
  waRequestCacheSet(WA_REQUEST_CACHE_NS.conversation, session.conversation_id, {
    id: session.conversation_id,
    companyId: session.company_id,
  });
  waRequestCacheSet(WA_REQUEST_CACHE_NS.company, session.company_id, {
    companyId: session.company_id,
  });
}

function mapSession(row: Record<string, unknown>): ChannelSessionRecord {
  return row as unknown as ChannelSessionRecord;
}

function mapInbound(row: Record<string, unknown>): ChannelInboundEventRecord {
  return row as unknown as ChannelInboundEventRecord;
}

function mapDelivery(row: Record<string, unknown>): ChannelDeliveryEventRecord {
  return row as unknown as ChannelDeliveryEventRecord;
}

export function createSupabaseChannelSessionRepository(client: SupabaseClient): ChannelSessionRepository {
  return {
    async findByExternalThread(companyChannelId, externalThreadId) {
      return waRequestGetOrLoad(
        WA_REQUEST_CACHE_NS.session,
        sessionCacheKey(companyChannelId, externalThreadId),
        async () => {
          const { data, error } = await client
            .from("channel_sessions")
            .select("*")
            .eq("company_channel_id", companyChannelId)
            .eq("external_thread_id", externalThreadId)
            .maybeSingle();

          if (error) throw error;
          const session = data ? mapSession(data) : null;
          if (session) {
            // Seed conversation/company keys without counting as extra loads.
            waRequestCacheSet(WA_REQUEST_CACHE_NS.conversation, session.conversation_id, {
              id: session.conversation_id,
              companyId: session.company_id,
            });
            waRequestCacheSet(WA_REQUEST_CACHE_NS.company, session.company_id, {
              companyId: session.company_id,
            });
          }
          return session;
        },
      );
    },

    async createSession(input: ResolveSessionInput & { conversationId: string }) {
      const { data, error } = await client
        .from("channel_sessions")
        .insert({
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          conversation_id: input.conversationId,
          channel_key: input.channelKey,
          external_thread_id: input.externalThreadId,
          sender_external_id: input.senderExternalId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();

      if (error) throw error;
      const session = mapSession(data);
      rememberSession(session);
      return session;
    },

    async touchInbound(sessionId) {
      const { data, error } = await client
        .from("channel_sessions")
        .update({ last_inbound_at: new Date().toISOString() })
        .eq("id", sessionId)
        .select("*")
        .single();

      if (error) throw error;
      const session = mapSession(data);
      rememberSession(session);
      return session;
    },

    async touchOutbound(sessionId) {
      const { data, error } = await client
        .from("channel_sessions")
        .update({ last_outbound_at: new Date().toISOString() })
        .eq("id", sessionId)
        .select("*")
        .single();

      if (error) throw error;
      const session = mapSession(data);
      rememberSession(session);
      return session;
    },
  };
}

export function createSupabaseChannelInboundEventRepository(
  client: SupabaseClient,
): ChannelInboundEventRepository {
  return {
    async findByIdempotencyKey(companyChannelId, idempotencyKey) {
      const { data, error } = await client
        .from("channel_inbound_events")
        .select("*")
        .eq("company_channel_id", companyChannelId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (error) throw error;
      return data ? mapInbound(data) : null;
    },

    async createEvent(input: CreateInboundEventInput) {
      const { data, error } = await client
        .from("channel_inbound_events")
        .insert({
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          idempotency_key: input.idempotencyKey,
          external_thread_id: input.externalThreadId,
          external_message_id: input.externalMessageId ?? null,
          sender_external_id: input.senderExternalId ?? null,
          payload: input.payload,
          processing_status: "received",
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapInbound(data);
    },

    async updateEvent(input: UpdateInboundEventInput) {
      const { data, error } = await client
        .from("channel_inbound_events")
        .update({
          processing_status: input.processingStatus,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId,
          incoming_message_id: input.incomingMessageId,
          runtime_execution_id: input.runtimeExecutionId,
          error_message: input.errorMessage,
          processed_at: input.processedAt,
        })
        .eq("id", input.inboundEventId)
        .select("*")
        .single();

      if (error) throw error;
      return mapInbound(data);
    },
  };
}

export function createSupabaseChannelDeliveryEventRepository(
  client: SupabaseClient,
): ChannelDeliveryEventRepository {
  return {
    async createEvent(input: CreateDeliveryEventInput) {
      const { data, error } = await client
        .from("channel_delivery_events")
        .insert({
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId ?? null,
          outbound_message_id: input.outboundMessageId ?? null,
          external_thread_id: input.externalThreadId,
          payload: input.payload,
          delivery_status: "pending",
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapDelivery(data);
    },

    async updateEvent(input: UpdateDeliveryEventInput) {
      const { data, error } = await client
        .from("channel_delivery_events")
        .update({
          delivery_status: input.deliveryStatus,
          external_message_id: input.externalMessageId,
          provider_response: input.providerResponse,
          error_message: input.errorMessage,
          attempt_count: input.attemptCount,
          sent_at: input.sentAt,
          delivered_at: input.deliveredAt,
          read_at: input.readAt,
          failed_at: input.failedAt,
        })
        .eq("id", input.deliveryEventId)
        .select("*")
        .single();

      if (error) throw error;
      return mapDelivery(data);
    },

    async findById(deliveryEventId) {
      const { data, error } = await client
        .from("channel_delivery_events")
        .select("*")
        .eq("id", deliveryEventId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapDelivery(data) : null;
    },

    async findByExternalMessageId(companyChannelId, externalMessageId) {
      const { data, error } = await client
        .from("channel_delivery_events")
        .select("*")
        .eq("company_channel_id", companyChannelId)
        .eq("external_message_id", externalMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? mapDelivery(data) : null;
    },
  };
}
