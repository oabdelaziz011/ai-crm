import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationChannelType, ConversationServices, ServiceContext as ConversationServiceContext } from "@workspace/ai-conversation";
import type { ChannelRegistryServices, ServiceContext as RegistryServiceContext } from "@workspace/channel-registry";
import type {
  ChannelConversationPort,
  ChannelPlatformPorts,
  ChannelRegistryPort,
  ChannelRuntimePort,
} from "@workspace/channel-platform";
import type { AutomationEngine } from "@workspace/automation-platform";
import type { RuntimeIntegrationServices, ServiceContext as RuntimeServiceContext } from "@workspace/runtime-integration";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";
import { createConversationSalesQualificationTurn } from "../services/conversation-sales-qualification.js";
import { extractResponseContent } from "@workspace/runtime-integration";
import { readAgentEmployeeExecutionContext, runWithEmployeeToolScope } from "./employee-runtime-bridge.js";
import { createChannelAutomationPort, createChannelAutomationPortFromClient, type ChannelAutomationAuth } from "./channel-automation-port.js";
import {
  WA_REQUEST_CACHE_NS,
  waRequestCacheDelete,
  waRequestCacheSet,
  waRequestGetOrLoad,
  type ResolvedCompanyChannel,
} from "@workspace/channel-platform";

function mapCompanyChannelRecord(record: {
  id: string;
  company_id: string;
  display_name: string;
  is_enabled: boolean;
  provider: string;
  configuration: Record<string, unknown>;
  communication_channel?: { key?: string } | null;
}): ResolvedCompanyChannel | null {
  const channelKey = record.communication_channel?.key;
  if (!channelKey) return null;

  return {
    id: record.id,
    companyId: record.company_id,
    channelKey,
    displayName: record.display_name,
    isEnabled: record.is_enabled,
    provider: record.provider,
    configuration: record.configuration ?? {},
  };
}

function rememberCompanyChannel(channel: ResolvedCompanyChannel | null): void {
  if (!channel) return;
  waRequestCacheSet(WA_REQUEST_CACHE_NS.companyChannel, channel.id, channel);
  waRequestCacheSet(WA_REQUEST_CACHE_NS.company, channel.companyId, {
    companyId: channel.companyId,
  });
}

export function createChannelRegistryPort(
  services: ChannelRegistryServices,
  ctx: RegistryServiceContext,
): ChannelRegistryPort {
  return {
    async getCompanyChannel(companyChannelId) {
      return waRequestGetOrLoad(WA_REQUEST_CACHE_NS.companyChannel, companyChannelId, async () => {
        const record = await services.companyChannels.getCompanyChannel(ctx, companyChannelId);
        const channel = mapCompanyChannelRecord(record);
        if (channel) {
          // One company identity load per request (derived from channel; no second DB round-trip).
          await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.company, channel.companyId, async () => ({
            companyId: channel.companyId,
          }));
        }
        return channel;
      });
    },

    async findCompanyChannelByPhoneNumberId(phoneNumberId) {
      return waRequestGetOrLoad(WA_REQUEST_CACHE_NS.companyChannelByPhone, phoneNumberId, async () => {
        const records = await services.companyChannels.findCompanyChannelByPhoneNumberId(
          ctx,
          phoneNumberId,
        );
        const channels = records
          .map((record) => mapCompanyChannelRecord(record))
          .filter((record): record is ResolvedCompanyChannel => record != null);
        for (const channel of channels) {
          rememberCompanyChannel(channel);
        }
        return channels;
      });
    },

    async findCompanyChannelsByWhatsAppVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelByWhatsAppVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledWhatsAppChannels() {
      const records = await services.companyChannels.listEnabledWhatsAppChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncWhatsAppPhoneNumberId(companyChannelId, phoneNumberId) {
      await services.companyChannels.syncWhatsAppPhoneNumberId(ctx, companyChannelId, phoneNumberId);
      waRequestCacheDelete(WA_REQUEST_CACHE_NS.companyChannel, companyChannelId);
      waRequestCacheDelete(WA_REQUEST_CACHE_NS.companyChannelByPhone, phoneNumberId);
    },

    async findCompanyChannelByInstagramBusinessAccountId(instagramBusinessAccountId) {
      const records = await services.companyChannels.findCompanyChannelByInstagramBusinessAccountId(
        ctx,
        instagramBusinessAccountId,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async findCompanyChannelsByInstagramVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelsByInstagramVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledInstagramChannels() {
      const records = await services.companyChannels.listEnabledInstagramChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncInstagramBusinessAccountId(companyChannelId, instagramBusinessAccountId) {
      await services.companyChannels.syncInstagramBusinessAccountId(
        ctx,
        companyChannelId,
        instagramBusinessAccountId,
      );
    },

    async findCompanyChannelByMessengerPageId(pageId) {
      const records = await services.companyChannels.findCompanyChannelByMessengerPageId(ctx, pageId);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async findCompanyChannelsByMessengerVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelsByMessengerVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledMessengerChannels() {
      const records = await services.companyChannels.listEnabledMessengerChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncMessengerPageId(companyChannelId, pageId) {
      await services.companyChannels.syncMessengerPageId(ctx, companyChannelId, pageId);
    },

    async findCompanyChannelByFromEmail(fromEmail) {
      const records = await services.companyChannels.findCompanyChannelByFromEmail(ctx, fromEmail);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledEmailChannels() {
      const records = await services.companyChannels.listEnabledEmailChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncEmailFromEmail(companyChannelId, fromEmail) {
      await services.companyChannels.syncEmailFromEmail(ctx, companyChannelId, fromEmail);
    },
  };
}

export function createChannelConversationPort(
  services: ConversationServices,
  ctx: ConversationServiceContext,
  options?: {
    resolveCompanyAssistantId?: (companyId: string) => Promise<string | null>;
    /** Service-role client for Phase 2 trusted customer_id binding (null-guard updates). */
    supabaseClient?: import("@supabase/supabase-js").SupabaseClient;
  },
): ChannelConversationPort {
  return {
    resolveCompanyAssistantId: options?.resolveCompanyAssistantId,

    async createConversation(input) {
      const meta = (input.metadata ?? {}) as Record<string, unknown>;
      const externalThreadId =
        (typeof meta.externalThreadId === "string" && meta.externalThreadId.trim()) ||
        (typeof meta.senderExternalId === "string" && meta.senderExternalId.trim()) ||
        null;

      // Ticket-centric SLA: conversation create must NOT invent lifecycle.slaDueAt.
      // SLA is calculated only when a support ticket is created (TicketCommandService).
      const created = await services.conversations.createConversation(ctx, {
        companyId: input.companyId,
        aiAssistantId: input.aiAssistantId,
        companyChannelId: input.companyChannelId,
        channelType: input.channelType as ConversationChannelType,
        metadata: meta,
        externalThreadId,
        departmentId: input.departmentId ?? null,
      });
      // Documented lifecycle: the inbound that creates a session is inbound_first_message
      // (idle → greeting). Handoff tools accept greeting and do not accept idle.
      if (created.state === "idle") {
        await services.state.startConversation(ctx, created.id);
      }

      // Channel-session creates set deferConversationStarted — publish after CRM identity stamp.
      if (meta.deferConversationStarted !== true) {
        void import("./lead-intelligence-bus.js")
          .then(({ publishConversationStarted }) => {
            const channelType = String(input.channelType ?? created.channel_type ?? "unknown");
            const senderExternalId =
              typeof meta.senderExternalId === "string" ? meta.senderExternalId : null;
            const explicitPhone = typeof meta.phone === "string" ? meta.phone : null;
            const derivedPhone =
              explicitPhone ||
              ((channelType === "whatsapp" || channelType === "sms") && senderExternalId
                ? senderExternalId
                : null);
            const customerId =
              typeof meta.trustedChannelCustomerId === "string"
                ? meta.trustedChannelCustomerId
                : typeof created.customer_id === "string"
                  ? created.customer_id
                  : null;
            return publishConversationStarted({
              companyId: input.companyId,
              conversationId: created.id,
              channelType,
              externalUserId: senderExternalId,
              externalThreadId,
              phone: derivedPhone,
              email: typeof meta.email === "string" ? meta.email : null,
              customerId,
              actorUserId: ctx.userId ?? null,
              createdAt: created.created_at ?? new Date().toISOString(),
            });
          })
          .catch((error) => {
            console.error("[ConversationStarted] publish failed", error);
          });
      }

      return { id: created.id };
    },

    async flushDeferredConversationStarted(input) {
      if (!options?.supabaseClient) return { published: false };
      const client = options.supabaseClient;
      const { data: conv, error } = await client
        .from("conversations")
        .select("id, company_id, channel_type, customer_id, metadata, created_at")
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!conv) return { published: false };
      const meta =
        conv.metadata && typeof conv.metadata === "object" && !Array.isArray(conv.metadata)
          ? ({ ...(conv.metadata as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      if (meta.deferConversationStarted !== true) return { published: false };
      if (meta.conversationStartedPublishedAt) return { published: false };

      const channelType = String(
        input.channelType || conv.channel_type || meta.channelType || "unknown",
      );
      const senderExternalId =
        input.externalUserId ??
        (typeof meta.senderExternalId === "string" ? meta.senderExternalId : null);
      const externalThreadId =
        input.externalThreadId ??
        (typeof meta.externalThreadId === "string" ? meta.externalThreadId : null);
      const explicitPhone = input.phone ?? (typeof meta.phone === "string" ? meta.phone : null);
      const derivedPhone =
        explicitPhone ||
        ((channelType === "whatsapp" || channelType === "sms") && senderExternalId
          ? senderExternalId
          : null);
      const customerId =
        input.customerId?.trim() ||
        (typeof conv.customer_id === "string" ? conv.customer_id : null) ||
        (typeof meta.trustedChannelCustomerId === "string" ? meta.trustedChannelCustomerId : null);

      await import("./lead-intelligence-bus.js").then(({ publishConversationStarted }) =>
        publishConversationStarted({
          companyId: input.companyId,
          conversationId: input.conversationId,
          channelType,
          externalUserId: senderExternalId,
          externalThreadId,
          phone: derivedPhone,
          email: input.email ?? (typeof meta.email === "string" ? meta.email : null),
          customerId,
          actorUserId: input.actorUserId ?? ctx.userId ?? null,
          createdAt: conv.created_at ?? new Date().toISOString(),
        }),
      );

      meta.deferConversationStarted = false;
      meta.conversationStartedPublishedAt = new Date().toISOString();
      if (customerId) meta.trustedChannelCustomerId = customerId;
      const { error: updateError } = await client
        .from("conversations")
        .update({ metadata: meta, updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId);
      if (updateError) throw new Error(updateError.message);
      return { published: true };
    },

    async addIncomingMessage(input) {
      const { message, reused } = await services.messages.addIncomingMessageIdempotent(ctx, {
        conversationId: input.conversationId,
        messageType: "incoming",
        contentType: "text",
        content: input.content,
        externalMessageId: input.externalMessageId ?? null,
        metadata: {
          ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
          ...(input.metadata ?? {}),
        },
      });

      if (!reused) {
        const conversation = await services.conversations.getConversation(ctx, input.conversationId);
        void import("./lead-intelligence-bus.js")
          .then(({ publishConversationMessageReceived }) =>
            publishConversationMessageReceived({
              companyId: conversation.company_id,
              conversationId: input.conversationId,
              messageId: message.id,
              channelType: conversation.channel_type ?? null,
              contentPreview: String(input.content ?? "").slice(0, 280),
              messageCount: null,
              customerId: conversation.customer_id ?? null,
              actorUserId: ctx.userId ?? null,
              receivedAt: message.created_at ?? new Date().toISOString(),
            }),
          )
          .catch((error) => {
            console.error("[ConversationMessageReceived] publish failed", error);
          });
      }

      return {
        id: message.id,
        conversationId: message.conversation_id,
        messageType: message.message_type,
        content: message.content,
        createdAt: message.created_at,
        reused,
      };
    },

    async applyMessageReaction(input) {
      const targetExternalMessageId = input.targetExternalMessageId.trim();
      if (!targetExternalMessageId) {
        return { applied: false };
      }

      const target = await services.messages.findByConversationAndExternalMessageId(
        ctx,
        input.conversationId,
        targetExternalMessageId,
      );
      if (!target) {
        return { applied: false };
      }

      const client = options?.supabaseClient;
      if (!client) {
        return { applied: false, messageId: target.id };
      }

      const existingMeta =
        target.metadata && typeof target.metadata === "object" && !Array.isArray(target.metadata)
          ? { ...(target.metadata as Record<string, unknown>) }
          : {};
      const existingReactions =
        existingMeta.reactions &&
        typeof existingMeta.reactions === "object" &&
        !Array.isArray(existingMeta.reactions)
          ? { ...(existingMeta.reactions as Record<string, unknown>) }
          : {};

      const emoji = input.emoji.trim();
      if (!emoji) {
        delete existingReactions[input.from];
      } else {
        existingReactions[input.from] = {
          emoji,
          at: new Date().toISOString(),
          ...(input.reactionExternalMessageId
            ? { reactionMessageId: input.reactionExternalMessageId }
            : {}),
        };
      }

      const nextMetadata = {
        ...existingMeta,
        reactions: existingReactions,
      };

      const { error } = await client
        .from("conversation_messages")
        .update({ metadata: nextMetadata })
        .eq("id", target.id)
        .eq("conversation_id", input.conversationId);

      if (error) {
        console.error("[applyMessageReaction] metadata update failed", error.message);
        return { applied: false, messageId: target.id };
      }

      return { applied: true, messageId: target.id };
    },

    async findIncomingMessageForInboundEvent(input) {
      if (input.externalMessageId) {
        const byExternal = await services.messages.findByConversationAndExternalMessageId(
          ctx,
          input.conversationId,
          input.externalMessageId,
        );
        if (byExternal) {
          return {
            id: byExternal.id,
            conversationId: byExternal.conversation_id,
            messageType: byExternal.message_type,
            content: byExternal.content,
            createdAt: byExternal.created_at,
            reused: true,
          };
        }
      }

      const byCorrelation = await services.messages.findByConversationAndInboundCorrelationId(
        ctx,
        input.conversationId,
        input.inboundEventId,
      );
      if (!byCorrelation) return null;

      return {
        id: byCorrelation.id,
        conversationId: byCorrelation.conversation_id,
        messageType: byCorrelation.message_type,
        content: byCorrelation.content,
        createdAt: byCorrelation.created_at,
        reused: true,
      };
    },

    async findMessageByExternalId(input) {
      const externalMessageId = input.externalMessageId?.trim();
      if (!externalMessageId) return null;
      const existing = await services.messages.findByConversationAndExternalMessageId(
        ctx,
        input.conversationId,
        externalMessageId,
      );
      if (!existing || existing.message_type !== "outgoing" || !existing.content?.trim()) return null;
      return {
        id: existing.id,
        conversationId: existing.conversation_id,
        messageType: existing.message_type,
        content: existing.content,
        createdAt: existing.created_at,
      };
    },

    async addOutgoingMessage(input) {
      try {
        const message = await services.messages.addMessage(ctx, {
          conversationId: input.conversationId,
          messageType: "outgoing",
          contentType: "text",
          content: input.content,
          metadata: input.metadata,
          externalMessageId: input.externalMessageId ?? null,
        });

        return {
          id: message.id,
          conversationId: message.conversation_id,
          messageType: message.message_type,
          content: message.content,
          createdAt: message.created_at,
          reused: false,
        };
      } catch (error) {
        const externalId = input.externalMessageId?.trim();
        if (externalId) {
          const existing = await services.messages.findByConversationAndExternalMessageId(
            ctx,
            input.conversationId,
            externalId,
          );
          if (existing) {
            return {
              id: existing.id,
              conversationId: existing.conversation_id,
              messageType: existing.message_type,
              content: existing.content,
              createdAt: existing.created_at,
              reused: true,
            };
          }
        }
        throw error;
      }
    },

    async confirmOutgoingDelivery(input) {
      if (!options?.supabaseClient || !input.messageId?.trim()) {
        return;
      }
      const { error } = await options.supabaseClient.rpc("confirm_conversation_message_outbound", {
        p_message_id: input.messageId,
        p_status: input.status,
        p_external_message_id: input.externalMessageId ?? null,
      });
      if (error) {
        throw error;
      }
    },

    async updateConversationMetadata(input) {
      await services.conversations.updateMetadata(ctx, {
        conversationId: input.conversationId,
        metadata: input.metadata,
      });
      waRequestCacheDelete(WA_REQUEST_CACHE_NS.conversation, `meta:${input.conversationId}`);
    },

    async getConversationMetadata(conversationId) {
      return waRequestGetOrLoad(WA_REQUEST_CACHE_NS.conversation, `meta:${conversationId}`, async () => {
        const conversation = await services.conversations.getConversation(ctx, conversationId);
        waRequestCacheSet(WA_REQUEST_CACHE_NS.conversation, conversationId, {
          id: conversationId,
          companyId: conversation.company_id,
        });
        return conversation.metadata ?? null;
      });
    },

    async hasOutgoingMessages(conversationId) {
      if (!options?.supabaseClient || !conversationId?.trim()) {
        return false;
      }
      const { count, error } = await options.supabaseClient
        .from("conversation_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("message_type", "outgoing");
      if (error) {
        return false;
      }
      return (count ?? 0) > 0;
    },

    async listIncomingMessagesAfter(input) {
      const client = options?.supabaseClient;
      if (!client || !input.conversationId?.trim() || !input.messageId?.trim()) {
        return [];
      }
      const { data: reference } = await client
        .from("conversation_messages")
        .select("created_at")
        .eq("id", input.messageId)
        .eq("conversation_id", input.conversationId)
        .maybeSingle();
      if (!reference?.created_at) {
        return [];
      }
      const { data, error } = await client
        .from("conversation_messages")
        .select("id, content")
        .eq("conversation_id", input.conversationId)
        .eq("message_type", "incoming")
        .gt("created_at", String(reference.created_at))
        .order("created_at", { ascending: true })
        .limit(10);
      if (error || !data) {
        return [];
      }
      return data.map((row) => ({ id: String(row.id), content: String(row.content ?? "") }));
    },

    async getConversationCustomerId(conversationId) {
      const conversation = await services.conversations.getConversation(ctx, conversationId);
      return conversation.customer_id ? String(conversation.customer_id) : null;
    },

    async linkConversationCustomerIfEmpty(input) {
      if (!input.conversationId?.trim() || !input.customerId?.trim() || !input.companyId?.trim()) {
        return;
      }
      const client = options?.supabaseClient;
      if (!client) return;
      // Null-guard only — never overwrite an existing trusted identity.
      // company_id filter keeps multi-tenant isolation under service-role.
      await client
        .from("conversations")
        .update({ customer_id: input.customerId })
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId)
        .is("customer_id", null);
    },
  };
}

export function createChannelRuntimePort(
  services: RuntimeIntegrationServices,
  ctx: RuntimeServiceContext,
  options?: {
    resolveRuntimeActorUserId?: (companyId: string) => Promise<string | null>;
    afterCustomerTurn?: (input: {
      companyId: string;
      conversationId: string;
      messageText: string;
      correlationId?: string;
      pageContext?: Record<string, unknown> | null;
      actorUserId: string | null;
    }) => Promise<void>;
  },
): ChannelRuntimePort {
  return {
    async execute(input) {
      const actorUserId = options?.resolveRuntimeActorUserId
        ? await options.resolveRuntimeActorUserId(input.companyId)
        : ctx.userId;

      // Phase 5E: AI Employee channel execution is product-authorized (assignment ∩ commercial ∩
      // ownership). Never inherit SYSTEM_CONTEXT.isSuperAdmin / hasPermission: () => true.
      // Technical service-role DB access remains on the Supabase client / SYSTEM_CONTEXT ports.
      const runtimeCtx: RuntimeServiceContext = createWebhookAiEmployeeServiceContext({
        companyId: input.companyId,
        userId: actorUserId,
      });

      const response = await (async () => {
        const executionContext = readAgentEmployeeExecutionContext(input.runtimeConfig.pageContext);
        const executeRuntime = () =>
          services.coordinator.execute(runtimeCtx, {
            companyId: input.companyId,
            conversationId: input.conversationId,
            messageText: input.messageText,
            providerConnectionId: input.runtimeConfig.providerConnectionId,
            knowledgeRetrieval: input.runtimeConfig.knowledgeRetrieval,
            executionPolicy: input.runtimeConfig.executionPolicy,
            pageContext: input.runtimeConfig.pageContext,
            correlationId: input.correlationId,
            onStreamChunk: input.onStreamChunk,
            abortSignal: input.abortSignal,
          });

        if (!executionContext) {
          return executeRuntime();
        }

        return runWithEmployeeToolScope(
          {
            allowedToolKeys: executionContext.allowedToolKeys,
            employeeId: executionContext.aiEmployeeId,
            showProductPrices: executionContext.employeeRuntime.pageContext?.showProductPrices === true,
          },
          executeRuntime,
        );
      })();

      if (options?.afterCustomerTurn) {
        try {
          await options.afterCustomerTurn({
            companyId: input.companyId,
            conversationId: input.conversationId,
            messageText: input.messageText,
            correlationId: input.correlationId,
            pageContext: input.runtimeConfig.pageContext,
            actorUserId,
          });
        } catch (error) {
          console.warn("[conversation-sales-qualification]", {
            companyId: input.companyId,
            conversationId: input.conversationId,
            err: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      return {
        executionId: response.executionId,
        responseContent: extractResponseContent(response.responseContent),
        correlationId: response.correlationId ?? input.correlationId ?? "",
        outgoingMessageId: response.outgoingMessageId ?? null,
        ...(response.replyImages?.length ? { replyImages: response.replyImages } : {}),
      };
    },
  };
}

export function createChannelPlatformPortsWithContext(
  deps: {
    channelRegistry: ChannelRegistryServices;
    conversation: ConversationServices;
    runtime: RuntimeIntegrationServices;
    automation?: AutomationEngine;
    supabaseClient?: SupabaseClient;
    employeeRuntime?: ChannelPlatformPorts["employeeRuntime"];
    customerIdentity?: ChannelPlatformPorts["customerIdentity"];
  },
  ctx: {
    registry: RegistryServiceContext;
    conversation: ConversationServiceContext;
    runtime: RuntimeServiceContext;
    /** Fixed company-scoped context or per-call resolver (Part 6C). Never SYSTEM_CONTEXT. */
    automation?: ChannelAutomationAuth;
  },
  options?: {
    resolveRuntimeActorUserId?: (companyId: string) => Promise<string | null>;
  },
): ChannelPlatformPorts {
  const resolveCompanyAssistantId = deps.supabaseClient
    ? async (companyId: string): Promise<string | null> => {
        const { data, error } = await deps.supabaseClient!
          .from("ai_assistant_settings")
          .select("id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        return data?.id ?? null;
      }
    : undefined;

  const ports: ChannelPlatformPorts = {
    registry: createChannelRegistryPort(deps.channelRegistry, ctx.registry),
    conversation: createChannelConversationPort(deps.conversation, ctx.conversation, {
      resolveCompanyAssistantId,
      supabaseClient: deps.supabaseClient,
    }),
    runtime: createChannelRuntimePort(deps.runtime, ctx.runtime, {
      resolveRuntimeActorUserId: options?.resolveRuntimeActorUserId,
      afterCustomerTurn: deps.supabaseClient
        ? createConversationSalesQualificationTurn(deps.supabaseClient)
        : undefined,
    }),
  };

  if (deps.employeeRuntime) {
    ports.employeeRuntime = deps.employeeRuntime;
  }

  if (deps.customerIdentity) {
    ports.customerIdentity = deps.customerIdentity;
  }

  if (deps.automation && ctx.automation) {
    ports.automation = deps.supabaseClient
      ? createChannelAutomationPortFromClient(deps.automation, ctx.automation, deps.supabaseClient)
      : createChannelAutomationPort(deps.automation, ctx.automation);
  }

  return ports;
}
