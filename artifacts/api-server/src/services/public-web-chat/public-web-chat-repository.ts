import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicWebChatWidget = {
  widgetId: string;
  companyId: string;
  companyChannelId: string;
  allowedOrigins: string[];
  aiEmployeeId: string | null;
  greeting: string;
  config: Record<string, unknown>;
};

export type PublicWebChatAuthorizedSession = {
  sessionId: string;
  companyId: string;
  widgetId: string;
  companyChannelId: string;
  conversationId: string | null;
  allowedOrigins: string[];
  aiEmployeeId: string | null;
  config: Record<string, unknown>;
  available: boolean;
};

export type PublicWebChatConversationBinding = {
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
};

export type PublicWebChatClaim = {
  submissionId: string;
  claimed: boolean;
  status: "processing" | "completed" | "failed";
  outcome: string | null;
  incomingMessageId: string | null;
};

export type PublicWebChatVisitorMessageRow = {
  sequence: number;
  sender: "visitor" | "assistant" | "agent";
  content: string;
  createdAt: string;
};

export class PublicWebChatUnavailableError extends Error {
  constructor() {
    super("web_chat_unavailable");
    this.name = "PublicWebChatUnavailableError";
  }
}

export class PublicWebChatSessionLimitError extends Error {
  constructor() {
    super("web_chat_session_limit");
    this.name = "PublicWebChatSessionLimitError";
  }
}

export interface PublicWebChatRepository {
  resolveWidget(publicKey: string): Promise<PublicWebChatWidget | null>;
  createSession(input: {
    widgetId: string;
    tokenHash: string;
    visitorId: string;
    ipHash: string | null;
    userAgentHash: string | null;
    ttlSeconds: number;
    maxActivePerIp: number;
  }): Promise<string>;
  resumeSession(widgetId: string, tokenHash: string): Promise<{ sessionId: string; expiresAt: string } | null>;
  authorizeSession(sessionId: string, tokenHash: string): Promise<PublicWebChatAuthorizedSession | null>;
  sessionAllowedOrigins(sessionId: string): Promise<string[]>;
  ensureConversation(sessionId: string): Promise<PublicWebChatConversationBinding>;
  claimMessage(sessionId: string, clientMessageId: string): Promise<PublicWebChatClaim>;
  completeMessage(input: {
    submissionId: string;
    status: "completed" | "failed";
    outcome: string;
    incomingMessageId: string | null;
  }): Promise<void>;
  findIncomingMessageId(conversationId: string, externalMessageId: string): Promise<string | null>;
  recordFallback(sessionId: string, clientMessageId: string, content: string): Promise<string | null>;
  listMessages(sessionId: string, after: number, limit: number): Promise<PublicWebChatVisitorMessageRow[]>;
}

type RpcError = { message?: string } | null;

function raiseFor(error: RpcError): never {
  const message = error?.message ?? "";
  if (message.includes("web_chat_session_limit")) throw new PublicWebChatSessionLimitError();
  if (message.includes("web_chat_unavailable")) throw new PublicWebChatUnavailableError();
  throw new Error(`public web chat repository failure: ${message.slice(0, 200)}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

export function createSupabasePublicWebChatRepository(client: SupabaseClient): PublicWebChatRepository {
  return {
    async resolveWidget(publicKey) {
      const { data, error } = await client.rpc("web_chat_public_resolve_widget", { p_public_key: publicKey });
      if (error) raiseFor(error);
      const row = firstRow<Record<string, unknown>>(data);
      if (!row?.widget_id) return null;
      return {
        widgetId: String(row.widget_id),
        companyId: String(row.company_id),
        companyChannelId: String(row.company_channel_id),
        allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins.map(String) : [],
        aiEmployeeId: row.ai_employee_id ? String(row.ai_employee_id) : null,
        greeting: typeof row.greeting === "string" ? row.greeting : "",
        config: asRecord(row.config),
      };
    },

    async createSession(input) {
      const { data, error } = await client.rpc("web_chat_public_create_session", {
        p_widget_id: input.widgetId,
        p_token_hash: input.tokenHash,
        p_visitor_id: input.visitorId,
        p_ip_hash: input.ipHash,
        p_user_agent_hash: input.userAgentHash,
        p_ttl_seconds: input.ttlSeconds,
        p_max_active_per_ip: input.maxActivePerIp,
      });
      if (error) raiseFor(error);
      if (typeof data !== "string") throw new PublicWebChatUnavailableError();
      return data;
    },

    async resumeSession(widgetId, tokenHash) {
      const { data, error } = await client.rpc("web_chat_public_resume_session", {
        p_widget_id: widgetId,
        p_token_hash: tokenHash,
      });
      if (error) raiseFor(error);
      const row = firstRow<Record<string, unknown>>(data);
      if (!row?.session_id) return null;
      return { sessionId: String(row.session_id), expiresAt: String(row.expires_at) };
    },

    async authorizeSession(sessionId, tokenHash) {
      const { data, error } = await client.rpc("web_chat_public_authorize_session", {
        p_session_id: sessionId,
        p_token_hash: tokenHash,
      });
      if (error) raiseFor(error);
      const row = firstRow<Record<string, unknown>>(data);
      if (!row?.session_id) return null;
      return {
        sessionId: String(row.session_id),
        companyId: String(row.company_id),
        widgetId: String(row.widget_id),
        companyChannelId: String(row.company_channel_id),
        conversationId: row.conversation_id ? String(row.conversation_id) : null,
        allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins.map(String) : [],
        aiEmployeeId: row.ai_employee_id ? String(row.ai_employee_id) : null,
        config: asRecord(row.config),
        available: row.available === true,
      };
    },

    async sessionAllowedOrigins(sessionId) {
      const { data, error } = await client.rpc("web_chat_public_session_allowed_origins", {
        p_session_id: sessionId,
      });
      if (error) raiseFor(error);
      return Array.isArray(data) ? data.map(String) : [];
    },

    async ensureConversation(sessionId) {
      const { data, error } = await client.rpc("web_chat_public_ensure_conversation", {
        p_session_id: sessionId,
      });
      if (error) raiseFor(error);
      const row = firstRow<Record<string, unknown>>(data);
      if (!row?.conversation_id || !row.channel_session_id) throw new PublicWebChatUnavailableError();
      return {
        conversationId: String(row.conversation_id),
        channelSessionId: String(row.channel_session_id),
        externalThreadId: String(row.external_thread_id),
      };
    },

    async claimMessage(sessionId, clientMessageId) {
      const { data, error } = await client.rpc("web_chat_public_claim_message", {
        p_session_id: sessionId,
        p_client_message_id: clientMessageId,
      });
      if (error) raiseFor(error);
      const row = firstRow<Record<string, unknown>>(data);
      if (!row?.submission_id) throw new PublicWebChatUnavailableError();
      return {
        submissionId: String(row.submission_id),
        claimed: row.claimed === true,
        status: (row.status as PublicWebChatClaim["status"]) ?? "processing",
        outcome: typeof row.outcome === "string" ? row.outcome : null,
        incomingMessageId: row.incoming_message_id ? String(row.incoming_message_id) : null,
      };
    },

    async completeMessage(input) {
      const { error } = await client.rpc("web_chat_public_complete_message", {
        p_submission_id: input.submissionId,
        p_status: input.status,
        p_outcome: input.outcome,
        p_incoming_message_id: input.incomingMessageId,
      });
      if (error) raiseFor(error);
    },

    async findIncomingMessageId(conversationId, externalMessageId) {
      const { data, error } = await client
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("external_message_id", externalMessageId)
        .eq("message_type", "incoming")
        .maybeSingle();
      if (error) raiseFor(error);
      return data?.id ? String(data.id) : null;
    },

    async recordFallback(sessionId, clientMessageId, content) {
      const { data, error } = await client.rpc("web_chat_public_record_fallback", {
        p_session_id: sessionId,
        p_client_message_id: clientMessageId,
        p_content: content,
      });
      if (error) raiseFor(error);
      return typeof data === "string" ? data : null;
    },

    async listMessages(sessionId, after, limit) {
      const { data, error } = await client.rpc("web_chat_public_list_messages", {
        p_session_id: sessionId,
        p_after: after,
        p_limit: limit,
      });
      if (error) raiseFor(error);
      return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
        sequence: Number(row.sequence),
        sender: (row.sender as PublicWebChatVisitorMessageRow["sender"]) ?? "assistant",
        content: typeof row.content === "string" ? row.content : "",
        createdAt: String(row.created_at),
      }));
    },
  };
}
