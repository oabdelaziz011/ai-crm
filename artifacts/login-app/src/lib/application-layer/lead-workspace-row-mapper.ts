import type { LeadReadModel } from "@workspace/application-layer";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { resolveScoreBand } from "@workspace/universal-operations-engine";

/** Canonical CRM LeadReadModel → workspace row. No dual-field coalescing. */
export function mapLeadReadModelToWorkspaceRow(lead: LeadReadModel): LeadWorkspaceRow {
  return Object.freeze({
    id: lead.id,
    tenantId: lead.tenantId,
    name: lead.name,
    contactPerson: lead.contactPerson,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.companyName,
    ownerId: lead.ownerId,
    owner: lead.owner,
    stageId: lead.stageId,
    stage: lead.stage,
    sourceId: lead.sourceId,
    source: lead.source,
    expectedValue: lead.expectedValue,
    expectedCloseDate: lead.expectedCloseDate,
    priority: lead.priority as LeadWorkspaceRow["priority"],
    temperature: lead.temperature,
    tags: [...lead.tags],
    notes: lead.notes,
    lastActivityAt: lead.lastActivityAt,
    lifecycleStatus: lead.lifecycleStatus,
    pipelineId: lead.pipelineId,
    currency: lead.currency,
    score: lead.score,
    scoreBand: resolveScoreBand(lead.score),
    isQualified: lead.isQualified,
    customerId: lead.customerId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  });
}
