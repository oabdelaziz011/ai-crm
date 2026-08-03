import type { LEAD_DOMAIN_EVENTS } from "../constants.js";
import type { LeadRecord } from "../types/lead-types.js";

export type LeadDomainEventType = (typeof LEAD_DOMAIN_EVENTS)[number];

export type LeadDomainEvent = {
  type: LeadDomainEventType;
  companyId: string;
  leadId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export function createLeadCreatedEvent(record: LeadRecord, actorUserId: string | null): LeadDomainEvent {
  return {
    type: "lead_created",
    companyId: record.companyId,
    leadId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, lifecycleStatus: record.lifecycleStatus, title: record.title },
  };
}

export function createLeadUpdatedEvent(
  record: LeadRecord,
  actorUserId: string | null,
  patch: Record<string, unknown>,
): LeadDomainEvent {
  return {
    type: "lead_updated",
    companyId: record.companyId,
    leadId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, patch },
  };
}

export function createLeadDeletedEvent(input: {
  companyId: string;
  leadId: string;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: "lead_deleted",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId: input.actorUserId },
  };
}

export function createLeadAssignedEvent(input: {
  companyId: string;
  leadId: string;
  assignedUserId: string;
  method: string;
  actorUserId: string | null;
  isReassign: boolean;
}): LeadDomainEvent {
  return {
    type: input.isReassign ? "lead_reassigned" : "lead_assigned",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: {
      assignedUserId: input.assignedUserId,
      method: input.method,
      actorUserId: input.actorUserId,
    },
  };
}

export function createLeadQualifiedEvent(input: {
  companyId: string;
  leadId: string;
  qualified: boolean;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: input.qualified ? "lead_qualified" : "lead_disqualified",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId: input.actorUserId },
  };
}

export function createLeadConvertedEvent(input: {
  companyId: string;
  leadId: string;
  customerId: string;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: "lead_converted",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: { customerId: input.customerId, actorUserId: input.actorUserId },
  };
}

export function createLeadArchivedEvent(input: {
  companyId: string;
  leadId: string;
  archived: boolean;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: input.archived ? "lead_archived" : "lead_restored",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId: input.actorUserId },
  };
}

export function createLeadStageChangedEvent(input: {
  companyId: string;
  leadId: string;
  previousStageId: string;
  newStageId: string;
  lifecycleStatus: string;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: "lead_stage_changed",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: {
      previousStageId: input.previousStageId,
      newStageId: input.newStageId,
      lifecycleStatus: input.lifecycleStatus,
      actorUserId: input.actorUserId,
    },
  };
}

export function createLeadPipelineChangedEvent(input: {
  companyId: string;
  leadId: string;
  previousPipelineId: string;
  newPipelineId: string;
  actorUserId: string | null;
}): LeadDomainEvent {
  return {
    type: "lead_pipeline_changed",
    companyId: input.companyId,
    leadId: input.leadId,
    occurredAt: new Date().toISOString(),
    payload: {
      previousPipelineId: input.previousPipelineId,
      newPipelineId: input.newPipelineId,
      actorUserId: input.actorUserId,
    },
  };
}
