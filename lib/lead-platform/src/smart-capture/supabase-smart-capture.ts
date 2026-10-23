import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadQueryService } from "../services/lead-query-service.js";
import type { LeadServiceContext } from "../types/lead-types.js";
import {
  buildCapturePhoneLookupVariants,
  deriveCapturePhone,
  isOpenLeadLifecycle,
  isPlaceholderContactName,
} from "./capture-identity.js";
import {
  AI_AUDIT_DECISIONS,
  AI_CAPTURE_ACTIVITY_TYPES,
  UNKNOWN_CONTACT_NAME,
  emptyAiCapture,
  evaluateContextThreshold,
  readAiCapture,
  toAiStatusDto,
  type AiAuditDecision,
  type AiCaptureIdentityStatus,
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


async function resolveSourceIdForChannel(
  leads: LeadSmartCaptureServices,
  ctx: LeadServiceContext,
  companyId: string,
  channel: string,
): Promise<string | null> {
  const { sources } = await leads.queries.listSources(ctx, { companyId });
  const key = channel.trim().toLowerCase();
  const byChannel = sources.find(
    (s) => s.isActive && s.channelType?.trim().toLowerCase() === key,
  );
  if (byChannel) return byChannel.id;
  const bySlug = sources.find((s) => s.isActive && s.slug?.trim().toLowerCase() === key);
  if (bySlug) return bySlug.id;
  return null;
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

async function findOpenLeadIdByCustomer(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("leads")
    .select("id, lifecycle_status, is_qualified, updated_at")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (isOpenLeadLifecycle(String(row.lifecycle_status ?? ""))) {
      return String(row.id);
    }
  }
  return null;
}

/** True when Postgres rejected an insert due to a unique index (incl. concurrency races). */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  return /duplicate key|unique constraint|leads_one_open_per_conversation/i.test(String(e.message ?? ""));
}

async function findLeadIdByPhoneVariants(
  client: SupabaseClient,
  companyId: string,
  phone: string,
): Promise<string | null> {
  const variants = buildCapturePhoneLookupVariants(phone);
  for (const variant of variants) {
    const { data } = await client
      .from("leads")
      .select("id, lifecycle_status")
      .eq("company_id", companyId)
      .eq("phone", variant)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    // Never fall back to closed/converted leads — a new engagement gets a new lead.
    const open = (data ?? []).find((row) => isOpenLeadLifecycle(String(row.lifecycle_status ?? "")));
    if (open?.id) return String(open.id);
  }
  return null;
}

/**
 * Resolve an existing lead for the same sales engagement.
 * Prefer conversation binding, then open lead for trusted customer, then identity keys.
 * Does not collapse distinct closed/converted leads into one record.
 */
async function findExistingLeadId(
  client: SupabaseClient,
  companyId: string,
  input: {
    conversationId: string;
    channelType: string;
    externalUserId?: string | null;
    phone?: string | null;
    email?: string | null;
    customerId?: string | null;
  },
): Promise<string | null> {
  const channel = normalizeChannelKey(input.channelType);
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const externalUserId = input.externalUserId?.trim() || null;
  const customerId = input.customerId?.trim() || null;

  const { data: conv } = await client
    .from("conversations")
    .select("lead_id, customer_id")
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

  const trustedCustomerId = customerId || (conv?.customer_id ? String(conv.customer_id) : null);
  if (trustedCustomerId) {
    const byCustomer = await findOpenLeadIdByCustomer(client, companyId, trustedCustomerId);
    if (byCustomer) return byCustomer;
  }

  const tryIdentityKey = async (key: string, value: string | null): Promise<string | null> => {
    if (!value) return null;
    const { data } = await client
      .from("leads")
      .select("id, lifecycle_status")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .contains("metadata", { aiCapture: { identityKeys: { [key]: value } } })
      .order("updated_at", { ascending: false })
      .limit(5);
    // Open leads only: closed/converted leads must never be reopened via identity keys.
    const open = (data ?? []).find((row) => isOpenLeadLifecycle(String(row.lifecycle_status ?? "")));
    return open?.id ? String(open.id) : null;
  };

  if (channel === "whatsapp") {
    const byWaExt = await tryIdentityKey("whatsapp", externalUserId);
    if (byWaExt) return byWaExt;
    if (phone) {
      const byWaPhone = await tryIdentityKey("whatsapp", phone);
      if (byWaPhone) return byWaPhone;
      const byPhone = await findLeadIdByPhoneVariants(client, companyId, phone);
      if (byPhone) return byPhone;
    }
  }

  if (phone) {
    for (const variant of buildCapturePhoneLookupVariants(phone)) {
      const byKey = await tryIdentityKey("phone", variant);
      if (byKey) return byKey;
    }
    const byPhone = await findLeadIdByPhoneVariants(client, companyId, phone);
    if (byPhone) return byPhone;
  }

  if (email) {
    const byKey = await tryIdentityKey("email", email);
    if (byKey) return byKey;
    const { data } = await client
      .from("leads")
      .select("id, lifecycle_status")
      .eq("company_id", companyId)
      .ilike("email", email)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    const open = (data ?? []).find((row) => isOpenLeadLifecycle(String(row.lifecycle_status ?? "")));
    if (open?.id) return String(open.id);
  }

  if (channel === "facebook" || channel === "messenger") {
    const byFb = await tryIdentityKey("facebook", externalUserId);
    if (byFb) return byFb;
    const byMessenger = await tryIdentityKey("messenger", externalUserId);
    if (byMessenger) return byMessenger;
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

async function resolveConversationCustomerId(
  client: SupabaseClient,
  companyId: string,
  conversationId: string,
  explicitCustomerId?: string | null,
): Promise<string | null> {
  const explicit = explicitCustomerId?.trim();
  if (explicit) {
    // Tenant guard: a customer id from another company is never trusted (fall back to the conversation stamp).
    const { data: owned } = await client
      .from("customers")
      .select("id")
      .eq("id", explicit)
      .eq("company_id", companyId)
      .maybeSingle();
    if (owned?.id) return explicit;
  }
  const { data } = await client
    .from("conversations")
    .select("customer_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.customer_id ? String(data.customer_id) : null;
}

async function loadCustomerDisplayName(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
  conversationId?: string | null,
): Promise<string | null> {
  const { data } = await client
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (name && !isPlaceholderContactName(name)) return name;

  // Prefer stamped trusted welcome name over channel placeholders (WhatsApp +E.164).
  if (conversationId) {
    const { data: conv } = await client
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    const meta =
      conv?.metadata && typeof conv.metadata === "object" && !Array.isArray(conv.metadata)
        ? (conv.metadata as Record<string, unknown>)
        : {};
    const trusted =
      typeof meta.trustedCustomerName === "string" ? meta.trustedCustomerName.trim() : "";
    if (trusted && !isPlaceholderContactName(trusted)) return trusted;
  }
  return null;
}

function resolveIdentityStatus(customerId: string | null, matchedExistingLead: boolean): AiCaptureIdentityStatus {
  if (customerId) return "matched_customer";
  if (matchedExistingLead) return "matched_lead";
  return "prospect";
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
      const phone = deriveCapturePhone({
        channelType: channel,
        phone: input.phone,
        externalUserId: input.externalUserId,
      });
      const customerId = await resolveConversationCustomerId(
        client,
        companyId,
        conversationId,
        input.customerId,
      );

      // Concurrency: re-check conversation.lead_id before create.
      const existingLeadId = await findExistingLeadId(client, companyId, {
        conversationId,
        channelType: channel,
        externalUserId: input.externalUserId,
        phone,
        email: input.email,
        customerId,
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

        const identityStatus = resolveIdentityStatus(customerId ?? lead.customerId, true);
        const prev = readAiCapture(lead.metadata) ?? emptyAiCapture();
        const next = mergeCapture(prev, {
          identityStatus,
          appendConversationId: conversationId,
          appendIdentity: {
            channelKey: channel,
            externalUserId: input.externalUserId,
            phone,
            email: input.email,
          },
        });

        const customerName =
          customerId && isPlaceholderContactName(lead.contactName)
            ? await loadCustomerDisplayName(client, companyId, customerId, conversationId)
            : null;

        await leads.commands.updateLead(ctx, {
          companyId,
          leadId: existingLeadId,
          ...(customerId && !lead.customerId ? { customerId } : {}),
          ...(customerName
            ? {
                title: isPlaceholderContactName(lead.title) ? customerName : undefined,
                contactName: customerName,
              }
            : {}),
          metadata: { ...lead.metadata, aiCapture: next },
        });

        await appendActivity(client, {
          companyId,
          leadId: existingLeadId,
          activityType: AI_CAPTURE_ACTIVITY_TYPES.conversationLinked,
          summary: "Conversation linked",
          payload: { conversationId, channel, customerId: customerId ?? null },
          actorUserId,
        });

        await writeAudit(client, {
          companyId,
          leadId: existingLeadId,
          conversationId,
          decision: AI_AUDIT_DECISIONS.conversationLinked,
          reason: customerId
            ? "Existing lead matched; linked trusted customer"
            : "Existing identity matched; conversation appended",
          metadata: { channel, identityStatus },
        });

        return toIntelligenceResult({
          companyId,
          leadId: existingLeadId,
          conversationId,
          capture: next,
          created: false,
        });
      }

      // Second check: another worker may have linked the conversation while we resolved.
      const { data: raced } = await client
        .from("conversations")
        .select("lead_id")
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (raced?.lead_id) {
        const racedLeadId = String(raced.lead_id);
        const { lead: racedLead } = await leads.queries.getLead(ctx, {
          companyId,
          leadId: racedLeadId,
        });
        if (racedLead) {
          const identityStatusRaced = resolveIdentityStatus(
            customerId ?? racedLead.customerId,
            true,
          );
          const prevRaced = readAiCapture(racedLead.metadata) ?? emptyAiCapture();
          const nextRaced = mergeCapture(prevRaced, {
            identityStatus: identityStatusRaced,
            appendConversationId: conversationId,
            appendIdentity: {
              channelKey: channel,
              externalUserId: input.externalUserId,
              phone,
              email: input.email,
            },
          });
          await leads.commands.updateLead(ctx, {
            companyId,
            leadId: racedLeadId,
            ...(customerId && !racedLead.customerId ? { customerId } : {}),
            metadata: { ...racedLead.metadata, aiCapture: nextRaced },
          });
          return toIntelligenceResult({
            companyId,
            leadId: racedLeadId,
            conversationId,
            capture: nextRaced,
            created: false,
          });
        }
      }

      const identityStatus = resolveIdentityStatus(customerId, false);
      const customerName = customerId
        ? await loadCustomerDisplayName(client, companyId, customerId, conversationId)
        : null;
      const displayName = customerName ?? UNKNOWN_CONTACT_NAME;

      const capture = emptyAiCapture({
        conversationId,
        channelKey: channel,
        externalUserId: input.externalUserId,
        phone,
        email: input.email,
      });
      const captureWithStatus = mergeCapture(capture, { identityStatus });

      let created: { lead: { id: string } };
      try {
        const sourceId = await resolveSourceIdForChannel(leads, ctx, companyId, channel);
        created = await leads.commands.createLead(ctx, {
          companyId,
          title: displayName,
          contactName: displayName,
          email: input.email ?? undefined,
          phone: phone ?? undefined,
          conversationId,
          customerId: customerId ?? undefined,
          ...(sourceId ? { sourceId } : {}),
          aiSummary: "",
          metadata: {
            aiCapture: captureWithStatus,
            smartCapture: {
              source: "conversation_started",
              channel,
              externalUserId: input.externalUserId ?? null,
              customerId: customerId ?? null,
            },
          },
        });
      } catch (error) {
        // Concurrent ConversationStarted: partial unique index leads_one_open_per_conversation_idx.
        if (!isUniqueViolation(error)) throw error;
        const winnerId =
          (await findExistingLeadId(client, companyId, {
            conversationId,
            channelType: channel,
            externalUserId: input.externalUserId,
            phone,
            email: input.email,
            customerId,
          })) ??
          (
            await client
              .from("conversations")
              .select("lead_id")
              .eq("id", conversationId)
              .eq("company_id", companyId)
              .is("deleted_at", null)
              .maybeSingle()
          ).data?.lead_id;
        if (!winnerId) throw error;
        const winnerLeadId = String(winnerId);
        const { lead: winner } = await leads.queries.getLead(ctx, {
          companyId,
          leadId: winnerLeadId,
        });
        if (!winner) throw error;
        await linkLeadToConversation(client, {
          companyId,
          conversationId,
          leadId: winnerLeadId,
        });
        const winnerStatus = resolveIdentityStatus(customerId ?? winner.customerId, true);
        const prevWinner = readAiCapture(winner.metadata) ?? emptyAiCapture();
        const nextWinner = mergeCapture(prevWinner, {
          identityStatus: winnerStatus,
          appendConversationId: conversationId,
          appendIdentity: {
            channelKey: channel,
            externalUserId: input.externalUserId,
            phone,
            email: input.email,
          },
        });
        await leads.commands.updateLead(ctx, {
          companyId,
          leadId: winnerLeadId,
          ...(customerId && !winner.customerId ? { customerId } : {}),
          metadata: { ...winner.metadata, aiCapture: nextWinner },
        });
        return toIntelligenceResult({
          companyId,
          leadId: winnerLeadId,
          conversationId,
          capture: nextWinner,
          created: false,
        });
      }

      await linkLeadToConversation(client, {
        companyId,
        conversationId,
        leadId: created.lead.id,
      });

      await appendActivity(client, {
        companyId,
        leadId: created.lead.id,
        activityType: AI_CAPTURE_ACTIVITY_TYPES.prospectCreated,
        summary: customerId ? "Prospect created for known customer" : "Prospect created",
        payload: { conversationId, channel, customerId: customerId ?? null },
        actorUserId,
      });

      await writeAudit(client, {
        companyId,
        leadId: created.lead.id,
        conversationId,
        decision: AI_AUDIT_DECISIONS.prospectCreated,
        reason: customerId
          ? "Trusted customer resolved; new open lead linked to customer"
          : "No existing identity; prospect created from ConversationStarted",
        metadata: { channel, identityStatus },
      });

      return toIntelligenceResult({
        companyId,
        leadId: created.lead.id,
        conversationId,
        capture: captureWithStatus,
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
        .select("lead_id, customer_id")
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

      // Backfill customer link after inbound CRM resolve stamps conversation.customer_id
      // (ConversationStarted often races ahead of trusted identity binding).
      const stampedCustomerId =
        input.customerId?.trim() ||
        (conv?.customer_id ? String(conv.customer_id) : null) ||
        null;
      if (stampedCustomerId && !lead.customerId) {
        const customerName = isPlaceholderContactName(lead.contactName)
          ? await loadCustomerDisplayName(client, companyId, stampedCustomerId, conversationId)
          : null;
        const prevCapture = readAiCapture(lead.metadata) ?? emptyAiCapture({ conversationId });
        const nextCapture = mergeCapture(prevCapture, {
          identityStatus: "matched_customer",
        });
        await leads.commands.updateLead(ctx, {
          companyId,
          leadId,
          customerId: stampedCustomerId,
          ...(customerName
            ? {
                title: isPlaceholderContactName(lead.title) ? customerName : undefined,
                contactName: customerName,
              }
            : {}),
          metadata: { ...lead.metadata, aiCapture: nextCapture },
        });
        lead.customerId = stampedCustomerId;
        lead.metadata = { ...lead.metadata, aiCapture: nextCapture };
        if (customerName) {
          lead.contactName = customerName;
          if (isPlaceholderContactName(lead.title)) lead.title = customerName;
        }
      }

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
