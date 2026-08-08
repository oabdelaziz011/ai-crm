import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadCommandService } from "../../services/lead-command-service.js";
import type { LeadQueryService } from "../../services/lead-query-service.js";
import type { LeadServiceContext } from "../../types/lead-types.js";
import {
  DEFAULT_SUGGESTION_THRESHOLD,
  type ProviderConfig,
} from "../contracts/provider-context.js";
import type { LeadIntelligenceResult } from "../contracts/pipeline-result.js";
import type { IntelligenceAuditEntry } from "../pipeline/lead-intelligence-pipeline.js";
import { readAiCapture, type AiCaptureMetadata } from "../../smart-capture/capture-types.js";

export type ApplyIntelligenceServices = {
  commands: LeadCommandService;
  queries: LeadQueryService;
};

export type ApplyIntelligenceResultInput = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  result: LeadIntelligenceResult;
  /** Optional per-provider audit entries collected during the pipeline run. */
  auditEntries?: readonly IntelligenceAuditEntry[];
  actorUserId?: string | null;
  config?: Partial<ProviderConfig>;
}>;

export type ApplyIntelligenceResultOutput = Readonly<{
  leadId: string;
  captureState: string;
  overallConfidence: number;
  suggestionsCreated: number;
  memoryUpserts: number;
  crmFieldsWritten: readonly string[];
}>;

function systemCtx(companyId: string, actorUserId: string): LeadServiceContext {
  return {
    userId: actorUserId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
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
  throw new Error("applyIntelligenceResult requires a company actor user id");
}

function preview(value: unknown, max = 400): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length <= max ? s : `${s.slice(0, max)}…`;
  } catch {
    return "";
  }
}

/**
 * Persist pipeline output onto canonical leads + AI intelligence tables.
 * Does not call Omnichannel / AI Employee.
 */
export async function applyIntelligenceResult(
  client: SupabaseClient,
  services: ApplyIntelligenceServices,
  input: ApplyIntelligenceResultInput,
): Promise<ApplyIntelligenceResultOutput> {
  const threshold = input.config?.suggestionThreshold ?? DEFAULT_SUGGESTION_THRESHOLD;
  const actorUserId = await resolveActorUserId(client, input.companyId, input.actorUserId);
  const ctx = systemCtx(input.companyId, actorUserId);
  const { lead } = await services.queries.getLead(ctx, {
    companyId: input.companyId,
    leadId: input.leadId,
  });
  if (!lead) throw new Error(`Lead not found: ${input.leadId}`);

  const result = input.result;
  const existingCapture = readAiCapture(lead.metadata) ?? null;
  const nextCapture: AiCaptureMetadata = {
    state: result.captureState,
    contextReady: true,
    conversationIds: existingCapture?.conversationIds?.length
      ? existingCapture.conversationIds.includes(input.conversationId)
        ? existingCapture.conversationIds
        : [...existingCapture.conversationIds, input.conversationId]
      : [input.conversationId],
    identityGraph: existingCapture?.identityGraph ?? [],
    identityKeys: existingCapture?.identityKeys ?? {},
    identityStatus: existingCapture?.identityStatus ?? "matched_lead",
    confidence: result.overallConfidence,
    contextSignals: existingCapture?.contextSignals ?? [],
    messageCount: existingCapture?.messageCount ?? 0,
    summary: result.summary.value || null,
    intent: result.intents[0]?.value ?? null,
    sentiment: result.sentiment.value,
    leadScore: result.score.overall.value,
    nextAction: result.recommendations[0]?.action ?? null,
  };

  const crmFieldsWritten: string[] = [];
  const patch: {
    companyId: string;
    leadId: string;
    aiSummary?: string;
    score?: number;
    temperature?: "hot" | "warm" | "cold";
    contactName?: string;
    companyName?: string;
    metadata: Record<string, unknown>;
  } = {
    companyId: input.companyId,
    leadId: input.leadId,
    metadata: {
      ...lead.metadata,
      aiCapture: nextCapture,
      aiIntelligence: result,
    },
  };

  if (result.summary.confidence >= threshold && result.summary.value.trim()) {
    patch.aiSummary = result.summary.value;
    crmFieldsWritten.push("ai_summary");
  }
  if (result.score.overall.confidence >= threshold) {
    patch.score = result.score.overall.value;
    crmFieldsWritten.push("score");
  }
  if (result.temperature.confidence >= threshold) {
    patch.temperature = result.temperature.value;
    crmFieldsWritten.push("temperature");
  }

  let suggestionsCreated = 0;

  const proposeOrWrite = async (
    fieldKey: "contactName" | "companyName",
    proposed: string | null,
    confidence: number,
    current: string | null | undefined,
  ) => {
    if (!proposed?.trim()) return;
    if (confidence >= threshold) {
      patch[fieldKey] = proposed.trim();
      crmFieldsWritten.push(fieldKey);
      return;
    }
    const { error } = await client.from("lead_ai_suggestions").insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      field_key: fieldKey,
      proposed_value: { value: proposed.trim() },
      current_value: { value: current ?? null },
      confidence,
      status: "pending",
      reason: `Below suggestion threshold (${threshold})`,
    });
    if (error) throw new Error(error.message);
    suggestionsCreated += 1;
  };

  await proposeOrWrite("contactName", result.contactName.value, result.contactName.confidence, lead.contactName);
  await proposeOrWrite("companyName", result.companyName.value, result.companyName.confidence, lead.companyName);

  await services.commands.updateLead(ctx, patch);

  const { error: activityError } = await client.from("lead_activities").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    activity_type: "ai_analysis_completed",
    summary: "AI lead intelligence analysis completed",
    payload: {
      overallConfidence: result.overallConfidence,
      processingTimeMs: result.processingTimeMs,
      captureState: result.captureState,
      intentCount: result.intents.length,
    },
    actor_user_id: actorUserId,
  });
  if (activityError) throw new Error(activityError.message);

  const auditRows = [
    ...(input.auditEntries ?? []).map((entry) => ({
      company_id: input.companyId,
      lead_id: input.leadId,
      conversation_id: input.conversationId,
      decision: entry.decision,
      reason: entry.reason,
      confidence: entry.confidence,
      actor: "ai",
      provider: entry.meta.providerId,
      model: entry.meta.model,
      version: entry.meta.version,
      latency_ms: entry.meta.latencyMs,
      input_preview: entry.inputPreview ?? null,
      output_preview: entry.outputPreview ?? null,
      metadata: {
        providerId: entry.meta.providerId,
        model: entry.meta.model,
        version: entry.meta.version,
        latencyMs: entry.meta.latencyMs,
        reason: entry.meta.reason,
      },
    })),
    {
      company_id: input.companyId,
      lead_id: input.leadId,
      conversation_id: input.conversationId,
      decision: "analysis_persisted",
      reason: "Lead intelligence result applied to lead metadata and CRM fields",
      confidence: result.overallConfidence,
      actor: "ai",
      provider: "pipeline",
      model: "orchestrator",
      version: "3.12.2",
      latency_ms: result.processingTimeMs,
      input_preview: preview({ conversationId: input.conversationId }),
      output_preview: preview({
        overallConfidence: result.overallConfidence,
        captureState: result.captureState,
      }),
      metadata: {
        fieldConfidence: result.fieldConfidence,
        crmFieldsWritten,
        suggestionsCreated,
      },
    },
  ];

  const { error: auditError } = await client.from("lead_ai_audit_log").insert(auditRows);
  if (auditError) throw new Error(auditError.message);

  let memoryUpserts = 0;
  for (const fact of result.memoryFacts) {
    const { error } = await client.from("lead_ai_memory").upsert(
      {
        company_id: input.companyId,
        lead_id: input.leadId,
        fact_key: fact.factKey,
        fact_value: fact.factValue,
        confidence: fact.confidence,
        source: fact.source,
        updated_at: fact.updatedAt,
      },
      { onConflict: "company_id,lead_id,fact_key" },
    );
    if (error) throw new Error(error.message);
    memoryUpserts += 1;
  }

  const { error: insightError } = await client.from("lead_ai_insights").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    payload: result,
    overall_confidence: result.overallConfidence,
    processing_ms: result.processingTimeMs,
  });
  if (insightError) throw new Error(insightError.message);

  return Object.freeze({
    leadId: input.leadId,
    captureState: result.captureState,
    overallConfidence: result.overallConfidence,
    suggestionsCreated,
    memoryUpserts,
    crmFieldsWritten: Object.freeze(crmFieldsWritten),
  });
}
