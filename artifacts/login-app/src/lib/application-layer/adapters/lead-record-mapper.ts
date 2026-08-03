import type { LeadReadModel } from "@workspace/application-layer";
import type { LeadRecord, LeadSummary } from "@workspace/lead-platform";

export function mapLeadRecordToReadModel(record: LeadRecord | LeadSummary, tenantId: string): LeadReadModel {
  const full = record as LeadRecord;
  return Object.freeze({
    id: record.id,
    tenantId,
    title: record.title,
    contactName: "contactName" in record ? record.contactName : record.title,
    email: "email" in full ? (full.email ?? null) : null,
    phone: "phone" in full ? (full.phone ?? null) : null,
    companyName: "companyName" in full ? (full.companyName ?? null) : null,
    lifecycleStatus: record.lifecycleStatus,
    priority: record.priority,
    score: record.score,
    estimatedValue: record.estimatedValue,
    currency: "currency" in full ? full.currency : "USD",
    pipelineId: record.pipelineId,
    stageId: record.stageId,
    assignedUserId: record.assignedUserId,
    customerId: "customerId" in full ? (full.customerId ?? null) : null,
    conversationId: "conversationId" in full ? (full.conversationId ?? null) : null,
    isQualified: record.isQualified,
    source: full.sourceId ?? undefined,
    owner: record.assignedUserId ?? undefined,
    convertedAt: "convertedAt" in full ? (full.convertedAt ?? undefined) : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
