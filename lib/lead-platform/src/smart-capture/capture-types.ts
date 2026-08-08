/**
 * Shared Smart Lead Capture types (Sprint 3.12.1).
 * Prospect = aiCapture.state on canonical leads row — not a parallel CRM.
 */

export const AI_CAPTURE_STATES = [
  "prospect",
  "context_ready",
  "lead",
  "qualified",
  "sales_ready",
  "converted",
] as const;

export type AiCaptureState = (typeof AI_CAPTURE_STATES)[number];

export type IdentityGraphNode = Readonly<{
  channelKey: string;
  externalUserId?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedAt: string;
}>;

export type IdentityKeyMap = Readonly<Partial<Record<string, string>>>;

export type AiCaptureIdentityStatus =
  | "unknown"
  | "prospect"
  | "matched_lead"
  | "matched_customer";

export type AiCaptureMetadata = Readonly<{
  state: AiCaptureState;
  contextReady: boolean;
  conversationIds: readonly string[];
  identityGraph: readonly IdentityGraphNode[];
  identityKeys: IdentityKeyMap;
  identityStatus: AiCaptureIdentityStatus;
  /** Real 0–1 confidence after 3.12.2 analysis; null until then (3.12.1 readers). */
  confidence: number | null;
  contextSignals: readonly string[];
  messageCount: number;
  summary: string | null;
  intent: string | null;
  sentiment: string | null;
  leadScore: number | null;
  nextAction: string | null;
}>;

export const UNKNOWN_CONTACT_NAME = "Unknown Contact";

export const AI_CAPTURE_ACTIVITY_TYPES = {
  prospectCreated: "ai_prospect_created",
  conversationLinked: "ai_conversation_linked",
  leadCreated: "ai_lead_created",
  leadUpdated: "ai_lead_updated",
  stateChanged: "ai_capture_state_changed",
  contextReady: "ai_context_ready",
} as const;

export const AI_AUDIT_DECISIONS = {
  prospectCreated: "prospect_created",
  conversationLinked: "conversation_linked",
  leadCreated: "lead_created",
  leadUpdated: "lead_updated",
  conversationIgnored: "conversation_ignored",
  contextReady: "context_ready",
  analysisRequested: "analysis_requested",
} as const;

export type AiAuditDecision = (typeof AI_AUDIT_DECISIONS)[keyof typeof AI_AUDIT_DECISIONS];

export type LeadAiAuditEntry = Readonly<{
  id: string;
  companyId: string;
  leadId: string | null;
  conversationId: string | null;
  decision: AiAuditDecision;
  reason: string;
  confidence: number | null;
  actor: "ai";
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type LeadAiStatusDto = Readonly<{
  captureState: AiCaptureState | null;
  contextReady: boolean;
  conversationCount: number;
  linkedChannels: readonly string[];
  identityStatus: AiCaptureIdentityStatus | null;
  /** Populated after Sprint 3.12.2 analysis; null for pre-analysis capture. */
  confidence: number | null;
  summary: string | null;
  intent: string | null;
  sentiment: string | null;
  leadScore: number | null;
  nextAction: string | null;
}>;

export type ConversationStartedCaptureInput = Readonly<{
  companyId: string;
  conversationId: string;
  channelType: string;
  externalUserId?: string | null;
  externalThreadId?: string | null;
  phone?: string | null;
  email?: string | null;
  actorUserId?: string | null;
  createdAt: string;
}>;

export type ConversationMessageCaptureInput = Readonly<{
  companyId: string;
  conversationId: string;
  messageId: string;
  channelType?: string | null;
  contentPreview?: string | null;
  messageCount?: number | null;
  actorUserId?: string | null;
  receivedAt: string;
}>;

export type LeadIntelligenceUpdatedResult = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  captureState: string;
  identityStatus: string;
  created: boolean;
  contextReady: boolean;
  /** Remains null for Smart Capture-only updates; set by 3.12.2 pipeline consumers. */
  confidence: number | null;
}>;

export type LeadAnalysisRequestedResult = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  reason: "context_threshold";
  messageCount: number;
  contextSignals: string[];
  /** Request events stay null until analysis runs (pipeline sets real confidence on result). */
  confidence: number | null;
}>;

export function emptyAiCapture(seed?: {
  conversationId?: string;
  channelKey?: string;
  externalUserId?: string | null;
  phone?: string | null;
  email?: string | null;
}): AiCaptureMetadata {
  const now = new Date().toISOString();
  const identityGraph: IdentityGraphNode[] = [];
  const identityKeys: Record<string, string> = {};

  if (seed?.channelKey) {
    identityGraph.push({
      channelKey: seed.channelKey,
      externalUserId: seed.externalUserId ?? null,
      phone: seed.phone ?? null,
      email: seed.email ?? null,
      linkedAt: now,
    });
    if (seed.externalUserId?.trim()) {
      identityKeys[seed.channelKey] = seed.externalUserId.trim();
    }
  }
  if (seed?.phone?.trim()) identityKeys.phone = seed.phone.trim();
  if (seed?.email?.trim()) identityKeys.email = seed.email.trim().toLowerCase();
  if (seed?.conversationId) identityKeys.conversation = seed.conversationId;

  return Object.freeze({
    state: "prospect",
    contextReady: false,
    conversationIds: seed?.conversationId ? [seed.conversationId] : [],
    identityGraph,
    identityKeys,
    identityStatus: "prospect",
    confidence: null,
    contextSignals: [],
    messageCount: 0,
    summary: null,
    intent: null,
    sentiment: null,
    leadScore: null,
    nextAction: null,
  });
}

export function readAiCapture(metadata: Record<string, unknown> | null | undefined): AiCaptureMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata.aiCapture;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cap = raw as Record<string, unknown>;
  const state = String(cap.state ?? "");
  if (!AI_CAPTURE_STATES.includes(state as AiCaptureState)) return null;

  return {
    state: state as AiCaptureState,
    contextReady: Boolean(cap.contextReady),
    conversationIds: Array.isArray(cap.conversationIds) ? cap.conversationIds.map(String) : [],
    identityGraph: Array.isArray(cap.identityGraph) ? (cap.identityGraph as IdentityGraphNode[]) : [],
    identityKeys:
      cap.identityKeys && typeof cap.identityKeys === "object" && !Array.isArray(cap.identityKeys)
        ? (cap.identityKeys as IdentityKeyMap)
        : {},
    identityStatus: (String(cap.identityStatus ?? "unknown") as AiCaptureIdentityStatus) || "unknown",
    confidence: typeof cap.confidence === "number" ? cap.confidence : null,
    contextSignals: Array.isArray(cap.contextSignals) ? cap.contextSignals.map(String) : [],
    messageCount: typeof cap.messageCount === "number" ? cap.messageCount : 0,
    summary: typeof cap.summary === "string" ? cap.summary : null,
    intent: typeof cap.intent === "string" ? cap.intent : null,
    sentiment: typeof cap.sentiment === "string" ? cap.sentiment : null,
    leadScore: typeof cap.leadScore === "number" ? cap.leadScore : null,
    nextAction: typeof cap.nextAction === "string" ? cap.nextAction : null,
  };
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readOptionalStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function toAiStatusDto(capture: AiCaptureMetadata | null): LeadAiStatusDto {
  if (!capture) {
    return {
      captureState: null,
      contextReady: false,
      conversationCount: 0,
      linkedChannels: [],
      identityStatus: null,
      confidence: null,
      summary: null,
      intent: null,
      sentiment: null,
      leadScore: null,
      nextAction: null,
    };
  }
  const channels = [...new Set(capture.identityGraph.map((n) => n.channelKey).filter(Boolean))];
  return {
    captureState: capture.state,
    contextReady: capture.contextReady,
    conversationCount: capture.conversationIds.length,
    linkedChannels: channels,
    identityStatus: capture.identityStatus,
    confidence: readOptionalNumber(capture.confidence),
    summary: readOptionalStringOrNull(capture.summary),
    intent: readOptionalStringOrNull(capture.intent),
    sentiment: readOptionalStringOrNull(capture.sentiment),
    leadScore: readOptionalNumber(capture.leadScore),
    nextAction: readOptionalStringOrNull(capture.nextAction),
  };
}

const MIN_MESSAGES = 6;

export function evaluateContextThreshold(input: {
  messageCount: number;
  contentPreview?: string | null;
  existingSignals?: readonly string[];
}): { ready: boolean; signals: readonly string[]; messageCount: number } {
  const signals = new Set((input.existingSignals ?? []).map(String));
  const text = (input.contentPreview ?? "").trim();

  if (text.length >= 8) signals.add("has_message_body");
  if (/@/.test(text) && /\./.test(text)) signals.add("has_email_like");
  if (/\+?\d[\d\s\-()]{7,}\d/.test(text)) signals.add("has_phone_like");
  if (/(اسمي|my name is|i am|أنا|انا)\s+\S+/i.test(text)) signals.add("has_name_signal");
  if (/(شركة|company|من شركة|from)\s+\S+/i.test(text)) signals.add("has_company_signal");

  const messageCount = Math.max(0, input.messageCount);
  if (messageCount >= MIN_MESSAGES) signals.add("message_count_threshold");

  const ready =
    messageCount >= MIN_MESSAGES &&
    (signals.has("has_name_signal") ||
      signals.has("has_company_signal") ||
      signals.has("has_email_like") ||
      messageCount >= MIN_MESSAGES + 2);

  return { ready, signals: [...signals], messageCount };
}
