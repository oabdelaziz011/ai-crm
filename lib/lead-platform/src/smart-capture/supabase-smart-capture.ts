import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadQueryService } from "../services/lead-query-service.js";
import type { LeadServiceContext } from "../types/lead-types.js";
import {
  AI_AUDIT_DECISIONS,
  AI_CAPTURE_ACTIVITY_TYPES,
  UNKNOWN_CONTACT_NAME,
  emptyAiCapture,
  evaluateContextThreshold,
  readAiCapture,
  toAiStatusDto,
  type AiAuditDecision,
  type AiCaptureMetadata,
  type ConversationMessageCaptureInput,
  type ConversationStartedCaptureInput,
  type LeadAiAuditEntry,
  type LeadAiStatusDto,
  type LeadAnalysisRequestedResult,
  type LeadIntelligenceUpdatedResult,
} from "./capture-types.js";

/** Minimal lead services surface required by Smart Capture. */
export type LeadSmartCaptureServices = {
  commands: LeadCommandService;
  queries: LeadQueryService;
};

/**
 * Production Smart Lead Capture — Prospect on canonical leads model.
 * Invoked only from Platform Event subscribers (never Omnichannel / AI Employee).
 */
export type LeadSmartCapture = {
  handleConversationStarted(
    input: ConversationStartedCaptureInput,
  ): Promise<LeadIntelligenceUpdatedResult | null>;

  handleConversationMessageReceived(input: ConversationMessageCaptureInput): Promise<{
    intelligence?: LeadIntelligenceUpdatedResult | null;
    analysisRequested?: LeadAnalysisRequestedResult | null;
  }>;

  getAiStatus(companyId: string, leadId: string): Promise<LeadAiStatusDto>;

  listAudit(companyId: string, leadId: string, limit?: number): Promise<readonly LeadAiAuditEntry[]>;
};

async function linkLeadToConversation(
  client: SupabaseClient,
  input: {
    companyId: string;
    conversationId: string;
    leadId: string;
  },
): Promise<void> {
  const { error: conversationError } = await client
    .from("conversations")
    .update({
      lead_id: input.leadId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (conversationError) throw new Error(conversationError.message);

  const { error: leadError } = await client
    .from("leads")
    .update({
      conversation_id: input.conversationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null);

  if (leadError) throw new Error(leadError.message);
}

function normalizeChannelKey(channelType: string): string {
  return channelType.trim().toLowerCase().replace(/\s+/g, "_") || "unknown";
}

async function resolveActorUserId(
  client: SupabaseClient,
  companyId: string,
  preferred?: string | null,
): Promise<string> {
  if (preferred?.trim()) return preferred.trim();
  const { data } = await client
    .from("profiles")
    .select("user_id")
    .eq("company_id", companyId)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (data?.user_id) return String(data.user_id);
  throw new Error("Smart lead capture requires a company actor user id");
}

function systemCtx(companyId: string, actorUserId: string): LeadServiceContext {
  return {
    userId: actorUserId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

function mergeCapture(
  existing: AiCaptureMetadata,
  patch: Partial<AiCaptureMetadata> & {
    appendConversationId?: string;
    appendIdentity?: {
      channelKey: string;
      externalUserId?: string | null;
      phone?: string | null;
      email?: string | null;
    };
  },
): AiCaptureMetadata {
  const conversationIds = [...existing.conversationIds];
  if (patch.appendConversationId && !conversationIds.includes(patch.appendConversationId)) {
    conversationIds.push(patch.appendConversationId);
  }

  const identityGraph = [...existing.identityGraph];
  const identityKeys: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing.identityKeys)) {
    if (value != null && value !== "") identityKeys[key] = value;
  }
  if (patch.appendIdentity) {
    const node = {
      channelKey: patch.appendIdentity.channelKey,
      externalUserId: patch.appendIdentity.externalUserId ?? null,
      phone: patch.appendIdentity.phone ?? null,
      email: patch.appendIdentity.email ?? null,
      linkedAt: new Date().toISOString(),
    };
    const dup = identityGraph.some(
      (n) =>
        n.channelKey === node.channelKey &&
        (n.externalUserId ?? "") === (node.externalUserId ?? "") &&
        (n.phone ?? "") === (node.phone ?? "") &&
        (n.email ?? "") === (node.email ?? ""),
    );
    if (!dup) identityGraph.push(node);
    if (node.externalUserId?.trim()) identityKeys[node.channelKey] = node.externalUserId.trim();
    if (node.phone?.trim()) identityKeys.phone = node.phone.trim();
    if (node.email?.trim()) identityKeys.email = node.email.trim().toLowerCase();
    if (patch.appendConversationId) identityKeys.conversation = patch.appendConversationId;
  }

  return {
    state: patch.state ?? existing.state,
    contextReady: patch.contextReady ?? existing.contextReady,
    conversationIds,
    identityGraph,
    identityKeys,
    identityStatus: patch.identityStatus ?? existing.identityStatus,
    confidence: null,
    contextSignals: patch.contextSignals ?? existing.contextSignals,
    messageCount: patch.messageCount ?? existing.messageCount,
    summary: null,
    intent: null,
    sentiment: null,
    leadScore: null,
    nextAction: null,
  };
}

async function findExistingLeadId(
  client: SupabaseClient,
  companyId: string,
  input: {
    conversationId: string;
    channelType: string;
    externalUserId?: string | null;
    phone?: string | null;
    email?: string | null;
  },
): Promise<string | null> {
  const channel = normalizeChannelKey(input.channelType);
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const externalUserId = input.externalUserId?.trim() || null;

  const { data: conv } = await client
    .from("conversations")
    .select("lead_id")
    .eq("id", input.conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (conv?.lead_id) return String(conv.lead_id);

  const { data: byConvLead } = await client
    .from("leads")
    .select("id")
    .eq("company_id", companyId)
    .eq("conversation_id", input.conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (byConvLead?.id) return String(byConvLead.id);

  const tryIdentityKey = async (key: string, value: string | null): Promise<string | null> => {
    if (!value) return null;
    const { data } = await client
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .contains("metadata", { aiCapture: { identityKeys: { [key]: value } } })
      .limit(1)
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  };

  if (channel === "whatsapp") {
    const byWaExt = await tryIdentityKey("whatsapp", externalUserId);
    if (byWaExt) return byWaExt;
    if (phone) {
      const byWaPhone = await tryIdentityKey("whatsapp", phone);
      if (byWaPhone) return byWaPhone;
      const { data } = await client
        .from("leads")
        .select("id")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (data?.id) return String(data.id);
    }
  }

  if (phone) {
    const byKey = await tryIdentityKey("phone", phone);
    if (byKey) return byKey;
    const { data } = await client
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (email) {
    const byKey = await tryIdentityKey("email", email);
    if (byKey) return byKey;
    const { data } = await client
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (channel === "facebook") {
    const byFb = await tryIdentityKey("facebook", externalUserId);
    if (byFb) return byFb;
  }

  if (channel === "instagram") {
    const byIg = await tryIdentityKey("instagram", externalUserId);
    if (byIg) return byIg;
  }

  if (externalUserId) {
    const byChannel = await tryIdentityKey(channel, externalUserId);
    if (byChannel) return byChannel;
  }

  return null;
}

async function writeAudit(
  client: SupabaseClient,
  input: {
    companyId: string;
    leadId: string | null;
    conversationId: string | null;
    decision: AiAuditDecision;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await client.from("lead_ai_audit_log").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    decision: input.decision,
    reason: input.reason,
    confidence: null,
    actor: "ai",
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

async function appendActivity(
  client: SupabaseClient,
  input: {
    companyId: string;
    leadId: string;
    activityType: string;
    summary: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  },
): Promise<void> {
  const { error } = await client.from("lead_activities").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    activity_type: input.activityType,
    summary: input.summary,
    payload: input.payload ?? {},
    actor_user_id: input.actorUserId,
  });
  if (error) throw new Error(error.message);
}

function toIntelligenceResult(input: {
  companyId: string;
  leadId: string;
  conversationId: string;
  capture: AiCaptureMetadata;
  created: boolean;
}): LeadIntelligenceUpdatedResult {
  return {
    companyId: input.companyId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    captureState: input.capture.state,
    identityStatus: input.capture.identityStatus,
    created: input.created,
    contextReady: input.capture.contextReady,
    confidence: null,
  };
}

export function createSupabaseLeadSmartCapture(
  client: SupabaseClient,
  services: LeadSmartCaptureServices,
): LeadSmartCapture {
  const leads = services;

  return {
    async handleConversationStarted(input: ConversationStartedCaptureInput) {
      const companyId = input.companyId;
      const conversationId = input.conversationId;
      const channel = normalizeChannelKey(input.channelType);
      const actorUserId = await resolveActorUserId(client, companyId, input.actorUserId);
      const ctx = systemCtx(companyId, actorUserId);

      const existingLeadId = await findExistingLeadId(client, companyId, {
        conversationId,
        channelType: channel,
        externalUserId: input.externalUserId,
        phone: input.phone,
        email: input.email,
      });

      if (existingLeadId) {
        const { lead } = await leads.queries.getLead(ctx, { companyId, leadId: existingLeadId });
        if (!lead) {
          await writeAudit(client, {
            companyId,
            leadId: null,
            conversationId,
            decision: AI_AUDIT_DECISIONS.conversationIgnored,
            reason: "Matched lead id missing from store",
          });
          return null;
        }

        await linkLeadToConversation(client, { companyId, conversationId, leadId: existingLeadId });

        const prev = readAiCapture(lead.metadata) ?? emptyAiCapture();
        const next = mergeCapture(prev, {
          identityStatus: "matched_lead",
          appendConversationId: conversationId,
          appendIdentity: {
            channelKey: channel,
            externalUserId: input.externalUserId,
            phone: input.phone,
            email: input.email,
          },
        });

        await leads.commands.updateLead(ctx, {
          companyId,
          leadId: existingLeadId,
          metadata: { ...lead.metadata, aiCapture: next },
        });

        await appendActivity(client, {
          companyId,
          leadId: existingLeadId,
          activityType: AI_CAPTURE_ACTIVITY_TYPES.conversationLinked,
          summary: "Conversation linked",
          payload: { conversationId, channel },
          actorUserId,
        });

        await writeAudit(client, {
          companyId,
          leadId: existingLeadId,
          conversationId,
          decision: AI_AUDIT_DECISIONS.conversationLinked,
          reason: "Existing identity matched; conversation appended",
          metadata: { channel },
        });

        return toIntelligenceResult({
          companyId,
          leadId: existingLeadId,
          conversationId,
          capture: next,
          created: false,
        });
      }

      const capture = emptyAiCapture({
        conversationId,
        channelKey: channel,
        externalUserId: input.externalUserId,
        phone: input.phone,
        email: input.email,
      });

      const created = await leads.commands.createLead(ctx, {
        companyId,
        title: UNKNOWN_CONTACT_NAME,
        contactName: UNKNOWN_CONTACT_NAME,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        conversationId,
        aiSummary: "",
        metadata: {
          aiCapture: capture,
          smartCapture: {
            source: "conversation_started",
            channel,
            externalUserId: input.externalUserId ?? null,
          },
        },
      });

      await linkLeadToConversation(client, {
        companyId,
        conversationId,
        leadId: created.lead.id,
      });

      await appendActivity(client, {
        companyId,
        leadId: created.lead.id,
        activityType: AI_CAPTURE_ACTIVITY_TYPES.prospectCreated,
        summary: "Prospect created",
        payload: { conversationId, channel },
        actorUserId,
      });

      await writeAudit(client, {
        companyId,
        leadId: created.lead.id,
        conversationId,
        decision: AI_AUDIT_DECISIONS.prospectCreated,
        reason: "No existing identity; prospect created from ConversationStarted",
        metadata: { channel },
      });

      return toIntelligenceResult({
        companyId,
        leadId: created.lead.id,
        conversationId,
        capture,
        created: true,
      });
    },

    async handleConversationMessageReceived(input: ConversationMessageCaptureInput) {
      const companyId = input.companyId;
      const conversationId = input.conversationId;
      const actorUserId = await resolveActorUserId(client, companyId, input.actorUserId);
      const ctx = systemCtx(companyId, actorUserId);

      const { data: conv } = await client
        .from("conversations")
        .select("lead_id")
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

      const leadId = conv?.lead_id ? String(conv.lead_id) : null;
      if (!leadId) {
        await writeAudit(client, {
          companyId,
          leadId: null,
          conversationId,
          decision: AI_AUDIT_DECISIONS.conversationIgnored,
          reason: "Message received before prospect link",
        });
        return {};
      }

      const { lead } = await leads.queries.getLead(ctx, { companyId, leadId });
      if (!lead) return {};

      const prev = readAiCapture(lead.metadata) ?? emptyAiCapture({ conversationId });
      if (prev.contextReady || prev.state !== "prospect") {
        return {};
      }

      let messageCount = input.messageCount ?? prev.messageCount;
      if (input.messageCount == null) {
        const { count } = await client
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .eq("message_type", "incoming");
        messageCount = count ?? prev.messageCount + 1;
      }

      const threshold = evaluateContextThreshold({
        messageCount,
        contentPreview: input.contentPreview,
        existingSignals: prev.contextSignals,
      });

      const next = mergeCapture(prev, {
        messageCount: threshold.messageCount,
        contextSignals: threshold.signals,
        contextReady: threshold.ready,
        state: threshold.ready ? "context_ready" : prev.state,
        appendConversationId: conversationId,
      });

      await leads.commands.updateLead(ctx, {
        companyId,
        leadId,
        metadata: { ...lead.metadata, aiCapture: next },
      });

      const intelligence = toIntelligenceResult({
        companyId,
        leadId,
        conversationId,
        capture: next,
        created: false,
      });

      if (!threshold.ready) {
        return { intelligence };
      }

      await appendActivity(client, {
        companyId,
        leadId,
        activityType: AI_CAPTURE_ACTIVITY_TYPES.contextReady,
        summary: "Context ready",
        payload: { messageCount: threshold.messageCount, signals: threshold.signals },
        actorUserId,
      });

      await writeAudit(client, {
        companyId,
        leadId,
        conversationId,
        decision: AI_AUDIT_DECISIONS.contextReady,
        reason: "Context threshold met; analysis requested (no AI in 3.12.1)",
        metadata: { signals: threshold.signals, messageCount: threshold.messageCount },
      });

      await writeAudit(client, {
        companyId,
        leadId,
        conversationId,
        decision: AI_AUDIT_DECISIONS.analysisRequested,
        reason: "LeadAnalysisRequested published for Sprint 3.12.2",
        metadata: { signals: threshold.signals },
      });

      const analysisRequested: LeadAnalysisRequestedResult = {
        companyId,
        leadId,
        conversationId,
        reason: "context_threshold",
        messageCount: threshold.messageCount,
        contextSignals: [...threshold.signals],
        confidence: null,
      };

      return { intelligence, analysisRequested };
    },

    async getAiStatus(companyId, leadId): Promise<LeadAiStatusDto> {
      const actorUserId = await resolveActorUserId(client, companyId, null);
      const { lead } = await leads.queries.getLead(systemCtx(companyId, actorUserId), {
        companyId,
        leadId,
      });
      if (!lead) return toAiStatusDto(null);
      return toAiStatusDto(readAiCapture(lead.metadata));
    },

    async listAudit(companyId, leadId, limit = 50): Promise<readonly LeadAiAuditEntry[]> {
      const { data, error } = await client
        .from("lead_ai_audit_log")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): LeadAiAuditEntry => ({
          id: String(row.id),
          companyId: String(row.company_id),
          leadId: row.lead_id ? String(row.lead_id) : null,
          conversationId: row.conversation_id ? String(row.conversation_id) : null,
          decision: row.decision as AiAuditDecision,
          reason: String(row.reason ?? ""),
          confidence: typeof row.confidence === "number" ? row.confidence : null,
          actor: "ai",
          metadata: (row.metadata as Record<string, unknown>) ?? {},
          createdAt: String(row.created_at),
        }),
      );
    },
  };
}
