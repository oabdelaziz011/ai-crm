import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadQueryService } from "../services/lead-query-service.js";
import type { LeadServiceContext } from "../types/lead-types.js";
import { readAiCapture } from "../smart-capture/capture-types.js";
import type { ProviderMessage, LeadSnapshot } from "./contracts/provider-context.js";
import { createHeuristicLeadIntelligenceProviders } from "./providers/heuristic/index.js";
import {
  runLeadIntelligencePipeline,
  type IntelligenceAuditEntry,
  type PipelineObservability,
} from "./pipeline/lead-intelligence-pipeline.js";
import {
  applyIntelligenceResult,
  type ApplyIntelligenceResultOutput,
} from "./persistence/apply-intelligence-result.js";
import type { LeadIntelligenceResult } from "./contracts/pipeline-result.js";

export type RunLeadAnalysisInput = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  actorUserId?: string | null;
  reason?: string;
}>;

export type RunLeadAnalysisOutput = Readonly<{
  result: LeadIntelligenceResult;
  applied: ApplyIntelligenceResultOutput;
  observability: PipelineObservability;
}>;

function systemCtx(companyId: string, actorUserId: string): LeadServiceContext {
  return {
    userId: actorUserId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

async function resolveActor(
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
  throw new Error("runLeadAnalysisFromEvent requires a company actor");
}

async function loadMessages(
  client: SupabaseClient,
  conversationId: string,
): Promise<ProviderMessage[]> {
  const { data, error } = await client
    .from("conversation_messages")
    .select("id, message_type, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    role: String(row.message_type ?? "incoming") === "incoming" ? "customer" : "agent",
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

/**
 * Event-driven analysis entrypoint (Sprint 3.12.2).
 * Called only from Platform Event subscribers on LeadAnalysisRequested.
 */
export async function runLeadAnalysisFromEvent(
  client: SupabaseClient,
  services: { commands: LeadCommandService; queries: LeadQueryService },
  input: RunLeadAnalysisInput,
): Promise<RunLeadAnalysisOutput> {
  const actorUserId = await resolveActor(client, input.companyId, input.actorUserId);
  const ctx = systemCtx(input.companyId, actorUserId);

  const { lead } = await services.queries.getLead(ctx, {
    companyId: input.companyId,
    leadId: input.leadId,
  });
  if (!lead) throw new Error(`Lead not found: ${input.leadId}`);

  const messages = await loadMessages(client, input.conversationId);
  const capture = readAiCapture(lead.metadata);
  const identityGraph = capture?.identityGraph ?? [];

  const snapshot: LeadSnapshot = {
    phone: lead.phone,
    email: lead.email,
    title: lead.title,
    contactName: lead.contactName,
    companyName: lead.companyName,
    metadata: lead.metadata ?? {},
    channelHints: identityGraph.map((n) => n.channelKey),
  };

  const auditEntries: IntelligenceAuditEntry[] = [];
  const providers = createHeuristicLeadIntelligenceProviders();

  const { result, observability } = await runLeadIntelligencePipeline(
    {
      companyId: input.companyId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      messages,
      lead: snapshot,
      captureState: capture?.state,
      config: { suggestionThreshold: 0.72 },
    },
    providers,
    async (entry) => {
      auditEntries.push(entry);
    },
  );

  const applied = await applyIntelligenceResult(client, services, {
    companyId: input.companyId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    result,
    auditEntries,
    actorUserId,
  });

  return { result, applied, observability };
}
