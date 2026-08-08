import type { LeadReadModel } from "@workspace/application-layer";
import { readAiCapture, toAiStatusDto } from "@workspace/application-layer";
import type { LeadRecord, LeadSummary } from "@workspace/lead-platform";

export type LeadEnrichmentLabels = {
  owner: string | null;
  stage: string;
  source: string | null;
};

/**
 * Maps persistence LeadRecord/LeadSummary → canonical CRM LeadReadModel.
 * Persistence names (title, contactName, assignedUserId, estimatedValue) end here.
 * Display labels must be resolved by the read adapter before calling this.
 */
export function mapLeadRecordToReadModel(
  record: LeadRecord | LeadSummary,
  tenantId: string,
  labels: LeadEnrichmentLabels,
): LeadReadModel {
  const full = record as LeadRecord;
  const name = record.title;
  const contactPerson = record.contactName;
  const expectedValue = record.estimatedValue;
  const ownerId = record.assignedUserId;
  const sourceId = "sourceId" in full ? (full.sourceId ?? null) : null;
  const tags = "tags" in full && Array.isArray(full.tags) ? [...full.tags] : [];
  const notes = "notes" in full ? String(full.notes ?? "") : "";
  const temperature =
    "temperature" in full &&
    (full.temperature === "hot" || full.temperature === "warm" || full.temperature === "cold")
      ? full.temperature
      : null;
  const expectedCloseDate =
    "expectedCloseDate" in full ? (full.expectedCloseDate ?? null) : null;
  const lastActivityAt =
    "lastActivityAt" in full ? (full.lastActivityAt ?? record.updatedAt) : record.updatedAt;
  const metadata =
    "metadata" in full && full.metadata && typeof full.metadata === "object"
      ? (full.metadata as Record<string, unknown>)
      : undefined;
  const aiStatus = metadata ? toAiStatusDto(readAiCapture(metadata)) : undefined;

  return Object.freeze({
    id: record.id,
    tenantId,
    name,
    contactPerson,
    email: "email" in full ? (full.email ?? null) : null,
    phone: "phone" in full ? (full.phone ?? null) : null,
    companyName: "companyName" in full ? (full.companyName ?? null) : null,
    ownerId,
    owner: ownerId ? labels.owner : null,
    stageId: record.stageId,
    stage: labels.stage,
    sourceId,
    source: sourceId ? labels.source : null,
    expectedValue,
    expectedCloseDate,
    priority: record.priority,
    temperature,
    tags,
    notes,
    lastActivityAt,
    lifecycleStatus: record.lifecycleStatus,
    pipelineId: record.pipelineId,
    currency: "currency" in full && full.currency ? full.currency : "USD",
    score: record.score,
    isQualified: record.isQualified,
    customerId: "customerId" in full ? (full.customerId ?? null) : null,
    conversationId: "conversationId" in full ? (full.conversationId ?? null) : null,
    ...(aiStatus ? { aiStatus } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
