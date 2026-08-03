import type { LeadReadModel } from "@workspace/application-layer";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { resolveScoreBand } from "@workspace/universal-operations-engine";

export function mapLeadReadModelToWorkspaceRow(
  lead: LeadReadModel,
  stageName?: string | null,
): LeadWorkspaceRow {
  return Object.freeze({
    id: lead.id,
    tenantId: lead.tenantId,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.companyName,
    lifecycleStatus: lead.lifecycleStatus,
    stageId: lead.stageId,
    stageName: stageName ?? lead.lifecycleStatus,
    pipelineId: lead.pipelineId,
    priority: (lead.priority as LeadWorkspaceRow["priority"]) ?? "normal",
    score: lead.score,
    scoreBand: resolveScoreBand(lead.score),
    estimatedValue: lead.estimatedValue,
    currency: lead.currency,
    assignedUserId: lead.assignedUserId,
    ownerName: lead.owner ?? null,
    sourceName: lead.source ?? null,
    tags: [],
    isQualified: lead.isQualified,
    customerId: lead.customerId,
    lastActivityAt: lead.updatedAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  });
}
