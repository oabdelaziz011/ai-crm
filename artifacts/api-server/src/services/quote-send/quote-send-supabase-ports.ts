import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceContext } from "@workspace/channel-platform";
import { createConversationServices } from "@workspace/ai-conversation";
import { createSupabaseOpportunityRepository } from "@workspace/opportunity-platform";
import { createNoopQuoteEventPublisher, createQuotePlatformServices } from "@workspace/quote-platform";
import {
  COMPANY_CHANNEL_SELECT,
  communicationChannelKey,
  isCompanyEmailChannelRow,
  readTrimmedString,
  type CompanyChannelRow,
} from "../../lib/company-email-channel.js";
import { isCompanyFeatureEnabled, resolveChannelCommercialFeatureCode } from "../../lib/require-company-feature.js";
import { dispatchOmnichannelOutboundMessage } from "../omnichannel-outbound-dispatch.js";
import {
  QuoteSendError,
  WHATSAPP_SERVICE_WINDOW_MS,
  type QuoteSendAttempt,
  type QuoteSendPorts,
  type QuoteSnapshot,
  type WhatsAppRouteResolution,
} from "./quote-send-service.js";

type AttemptRow = {
  id: string;
  quote_id: string;
  channel: "email" | "whatsapp";
  status: "pending" | "sent" | "failed";
  recipient: string | null;
  conversation_id: string | null;
  external_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

const ATTEMPT_SELECT =
  "id, quote_id, channel, status, recipient, conversation_id, external_message_id, error_code, error_message, created_at";

function mapAttempt(row: AttemptRow): QuoteSendAttempt {
  return {
    id: row.id,
    quoteId: row.quote_id,
    channel: row.channel,
    status: row.status,
    recipient: row.recipient,
    conversationId: row.conversation_id,
    externalMessageId: row.external_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "23505" || /duplicate key/i.test(error.message ?? "")));
}

export type QuoteSendPortDeps = {
  /** Service role — company-filtered lookups, attempts, conversation/session plumbing. */
  serviceClient: SupabaseClient;
  /** Caller JWT — quote reads/writes and quote history stay under RLS. */
  userClient: SupabaseClient;
  companyId: string;
  actorUserId: string | null;
  isSuperAdmin: boolean;
  /** Real caller permission check (already verified to hold quotes.send). */
  hasPermission: (code: string) => boolean;
  /** Context handed to the channel platform (see createQuoteSendDispatchContext). */
  dispatchContext: ServiceContext;
};

export function createQuoteSendSupabasePorts(deps: QuoteSendPortDeps): QuoteSendPorts {
  const { serviceClient, userClient } = deps;

  const quoteContext = () => ({
    userId: deps.actorUserId,
    companyId: deps.companyId,
    isSuperAdmin: deps.isSuperAdmin,
    hasPermission: deps.hasPermission,
  });

  const loadCompanyChannels = async (companyId: string): Promise<CompanyChannelRow[]> => {
    const { data, error } = await serviceClient
      .from("company_channels")
      .select(COMPANY_CHANNEL_SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw error;
    return (data ?? []) as CompanyChannelRow[];
  };

  return {
    async loadQuote(companyId, quoteId) {
      const { data: quote, error } = await userClient
        .from("quotes")
        .select(
          "id, company_id, quote_number, title, status, currency, language, contact_name, valid_until, subtotal, discount_total, tax_total, shipping_total, grand_total, notes, customer_id, opportunity_id, created_at",
        )
        .eq("id", quoteId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!quote) return null;

      const { data: lines, error: linesError } = await userClient
        .from("quote_line_items")
        .select(
          "product_name_snapshot, section_title, line_kind, quantity, unit_price, discount_amount, tax_amount, total, is_optional, sort_order",
        )
        .eq("quote_id", quoteId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (linesError) throw linesError;

      return {
        id: quote.id,
        companyId: quote.company_id,
        quoteNumber: quote.quote_number,
        title: quote.title ?? "",
        status: quote.status,
        currency: quote.currency ?? "USD",
        language: quote.language ?? "en",
        contactName: quote.contact_name ?? "",
        validUntil: quote.valid_until ?? null,
        subtotal: num(quote.subtotal),
        discountTotal: num(quote.discount_total),
        taxTotal: num(quote.tax_total),
        shippingTotal: num(quote.shipping_total),
        grandTotal: num(quote.grand_total),
        notes: quote.notes ?? "",
        customerId: quote.customer_id ?? null,
        opportunityId: quote.opportunity_id ?? null,
        createdAt: quote.created_at,
        lines: (lines ?? []).map((line) => ({
          name:
            readTrimmedString(line.product_name_snapshot) ??
            readTrimmedString(line.section_title) ??
            String(line.line_kind ?? ""),
          quantity: num(line.quantity),
          unitPrice: num(line.unit_price),
          discountAmount: num(line.discount_amount),
          taxAmount: num(line.tax_amount),
          total: num(line.total),
          isOptional: Boolean(line.is_optional),
        })),
      } satisfies QuoteSnapshot;
    },

    async loadCompanyIdentity(companyId) {
      const { data, error } = await serviceClient
        .from("companies")
        .select("name, logo_url, contact_email, contact_phone")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return {
        name: readTrimmedString(data?.name) ?? "",
        logoUrl: readTrimmedString(data?.logo_url),
        contactEmail: readTrimmedString(data?.contact_email),
        contactPhone: readTrimmedString(data?.contact_phone),
      };
    },

    async resolveRecipient(companyId, quote) {
      let customerId = quote.customerId;
      let leadId: string | null = null;
      if (quote.opportunityId) {
        const { data: opportunity, error } = await serviceClient
          .from("opportunities")
          .select("customer_id, lead_id")
          .eq("id", quote.opportunityId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (error) throw error;
        customerId = customerId ?? opportunity?.customer_id ?? null;
        leadId = opportunity?.lead_id ?? null;
      }

      let lead: { contact_name: string | null; email: string | null; phone: string | null; customer_id: string | null } | null =
        null;
      if (leadId) {
        const { data, error } = await serviceClient
          .from("leads")
          .select("contact_name, email, phone, customer_id")
          .eq("id", leadId)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        lead = data;
        customerId = customerId ?? lead?.customer_id ?? null;
      }

      let customer: { name: string | null; email: string | null; phone: string | null; phone_e164: string | null } | null =
        null;
      if (customerId) {
        const { data, error } = await serviceClient
          .from("customers")
          .select("name, email, phone, phone_e164")
          .eq("id", customerId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (error) throw error;
        customer = data;
        if (!customer) customerId = null;
      }

      return {
        customerId,
        leadId,
        name: readTrimmedString(customer?.name) ?? readTrimmedString(lead?.contact_name) ?? quote.contactName,
        email: readTrimmedString(customer?.email) ?? readTrimmedString(lead?.email),
        phone:
          readTrimmedString(customer?.phone_e164) ??
          readTrimmedString(customer?.phone) ??
          readTrimmedString(lead?.phone),
      };
    },

    async isChannelEntitled(companyId, channel) {
      const featureCode = resolveChannelCommercialFeatureCode(channel);
      if (!featureCode) return false;
      return isCompanyFeatureEnabled(companyId, featureCode);
    },

    async findEmailChannel(companyId) {
      const rows = await loadCompanyChannels(companyId);
      const channel = rows.find((row) => isCompanyEmailChannelRow(companyId, row) && row.is_enabled !== false);
      if (!channel) return null;
      return { companyChannelId: channel.id, fromEmail: readTrimmedString(channel.configuration?.fromEmail) };
    },

    async resolveWhatsAppRoute(companyId, recipient, now): Promise<WhatsAppRouteResolution> {
      const rows = await loadCompanyChannels(companyId);
      const whatsappChannelIds = rows
        .filter((row) => communicationChannelKey(row) === "whatsapp" && row.is_enabled !== false)
        .map((row) => row.id);
      if (whatsappChannelIds.length === 0) return { ok: false, reason: "no_whatsapp_channel" };

      const ownerFilters = [
        recipient.customerId ? `customer_id.eq.${recipient.customerId}` : null,
        recipient.leadId ? `lead_id.eq.${recipient.leadId}` : null,
      ].filter((value): value is string => Boolean(value));
      if (ownerFilters.length === 0) return { ok: false, reason: "no_whatsapp_conversation" };

      const { data: conversations, error } = await serviceClient
        .from("conversations")
        .select("id, company_channel_id")
        .eq("company_id", companyId)
        .eq("channel_type", "whatsapp")
        .is("deleted_at", null)
        .in("company_channel_id", whatsappChannelIds)
        .or(ownerFilters.join(","))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      const conversationIds = (conversations ?? []).map((row) => row.id);
      if (conversationIds.length === 0) return { ok: false, reason: "no_whatsapp_conversation" };

      const { data: sessions, error: sessionsError } = await serviceClient
        .from("channel_sessions")
        .select("id, conversation_id, company_channel_id, external_thread_id, last_inbound_at")
        .eq("company_id", companyId)
        .eq("channel_key", "whatsapp")
        .in("conversation_id", conversationIds)
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (sessionsError) throw sessionsError;

      const usable = (sessions ?? []).filter(
        (row) => row.external_thread_id && whatsappChannelIds.includes(row.company_channel_id),
      );
      if (usable.length === 0) return { ok: false, reason: "no_whatsapp_conversation" };

      const withinWindow = usable.find((row) => {
        if (!row.last_inbound_at) return false;
        const at = new Date(row.last_inbound_at).getTime();
        return Number.isFinite(at) && now.getTime() - at <= WHATSAPP_SERVICE_WINDOW_MS;
      });
      if (!withinWindow) return { ok: false, reason: "whatsapp_window_closed" };

      return {
        ok: true,
        companyChannelId: withinWindow.company_channel_id,
        conversationId: withinWindow.conversation_id,
        channelSessionId: withinWindow.id,
        externalThreadId: withinWindow.external_thread_id,
      };
    },

    async findAttemptByKey(companyId, idempotencyKey) {
      const { data, error } = await serviceClient
        .from("quote_send_attempts")
        .select(ATTEMPT_SELECT)
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAttempt(data as AttemptRow) : null;
    },

    async closeStalePendingAttempts(companyId, quoteId, olderThan) {
      const nowIso = new Date().toISOString();
      const { error } = await serviceClient
        .from("quote_send_attempts")
        .update({
          status: "failed",
          error_code: "stale_pending",
          error_message: "Send attempt did not complete.",
          completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .eq("status", "pending")
        .lt("created_at", olderThan.toISOString());
      if (error) throw error;
    },

    async createPendingAttempt(input) {
      const { data, error } = await serviceClient
        .from("quote_send_attempts")
        .insert({
          company_id: input.companyId,
          quote_id: input.quoteId,
          channel: input.channel,
          idempotency_key: input.idempotencyKey,
          status: "pending",
          recipient: input.recipient,
          actor_user_id: input.actorUserId,
        })
        .select(ATTEMPT_SELECT)
        .single();
      if (error) {
        if (isUniqueViolation(error)) {
          const byKey = /idempotency/i.test(error.message ?? "") || /idempotency/i.test(error.details ?? "");
          return { conflict: byKey ? "duplicate_key" : "pending_exists" };
        }
        throw error;
      }
      return { attempt: mapAttempt(data as AttemptRow) };
    },

    async completeAttempt(attemptId, patch) {
      const nowIso = new Date().toISOString();
      const { error } = await serviceClient
        .from("quote_send_attempts")
        .update({
          status: patch.status,
          company_channel_id: patch.companyChannelId ?? null,
          conversation_id: patch.conversationId ?? null,
          delivery_event_id: patch.deliveryEventId ?? null,
          external_message_id: patch.externalMessageId ?? null,
          error_code: patch.errorCode ?? null,
          error_message: patch.errorMessage ?? null,
          completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", attemptId)
        .eq("company_id", deps.companyId);
      if (error) throw error;
    },

    async createEmailConversation(input) {
      const assistantId = await resolveCompanyAssistantId(serviceClient, input.companyId);
      if (!assistantId) {
        throw new QuoteSendError(
          409,
          "email_workspace_not_ready",
          "Email Workspace is not set up for this company yet (no assistant configured).",
        );
      }
      const services = createConversationServices(serviceClient);
      const conversation = await services.conversations.createConversation(deps.dispatchContext, {
        companyId: input.companyId,
        aiAssistantId: assistantId,
        channelType: "email",
        companyChannelId: input.companyChannelId,
        customerId: input.recipient.customerId,
        metadata: {
          emailComposeOrigin: "new_email",
          subject: input.subject,
          source: "quote_send",
          quoteId: input.quoteId,
        },
        createdBy: deps.actorUserId,
      });

      if (input.recipient.leadId) {
        const { error: leadLinkError } = await serviceClient
          .from("conversations")
          .update({ lead_id: input.recipient.leadId })
          .eq("id", conversation.id)
          .eq("company_id", input.companyId)
          .is("lead_id", null);
        if (leadLinkError) console.error("[quote-send] lead link failed", leadLinkError);
      }

      const { data: session, error: sessionError } = await serviceClient
        .from("channel_sessions")
        .insert({
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          conversation_id: conversation.id,
          channel_key: "email",
          external_thread_id: conversation.id,
          sender_external_id: input.fromEmail,
          metadata: { source: "quote_send", quoteId: input.quoteId },
        })
        .select("id, external_thread_id")
        .single();
      if (sessionError) throw sessionError;

      return {
        conversationId: conversation.id,
        channelSessionId: session.id,
        externalThreadId: session.external_thread_id,
      };
    },

    async dispatch(input) {
      const result = await dispatchOmnichannelOutboundMessage(deps.dispatchContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        companyChannelId: input.companyChannelId,
        channelKey: input.channelKey,
        channelSessionId: input.channelSessionId,
        externalThreadId: input.externalThreadId,
        text: input.text,
        metadata: input.metadata,
        persistConversationMessage: true,
      });
      return {
        deliveryEventId: result.deliveryEventId ?? null,
        externalMessageId: result.externalMessageId ?? null,
        deliveryStatus: String(result.deliveryStatus ?? "sent"),
      };
    },

    async markQuoteSent(companyId, quoteId) {
      const opportunities = createSupabaseOpportunityRepository(userClient);
      const platform = createQuotePlatformServices(userClient, {
        events: createNoopQuoteEventPublisher(),
        opportunityHistory: {
          addHistory: async (history) => {
            await opportunities.addHistory(history);
          },
        },
      });
      const { quote } = await platform.commands.changeStatus(quoteContext(), {
        companyId,
        quoteId,
        status: "sent",
      });
      return { status: quote.status, sentAt: quote.sentAt };
    },

    async addQuoteHistory(input) {
      const { error } = await userClient.from("quote_history").insert({
        company_id: input.companyId,
        quote_id: input.quoteId,
        event_type: input.eventType,
        summary: input.summary,
        payload: input.payload,
        actor_user_id: input.actorUserId,
      });
      if (error) throw error;
    },
  };
}

async function resolveCompanyAssistantId(client: SupabaseClient, companyId: string): Promise<string | null> {
  const { data: settings } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (settings?.id) return settings.id;
  const { data: conversation } = await client
    .from("conversations")
    .select("ai_assistant_id")
    .eq("company_id", companyId)
    .not("ai_assistant_id", "is", null)
    .limit(1)
    .maybeSingle();
  return conversation?.ai_assistant_id ?? null;
}
