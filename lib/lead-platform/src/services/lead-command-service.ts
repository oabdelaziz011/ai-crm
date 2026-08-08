import { LEAD_PERMISSIONS } from "../constants.js";
import {
  createLeadArchivedEvent,
  createLeadAssignedEvent,
  createLeadConvertedEvent,
  createLeadCreatedEvent,
  createLeadDeletedEvent,
  createLeadPipelineChangedEvent,
  createLeadQualifiedEvent,
  createLeadStageChangedEvent,
  createLeadUpdatedEvent,
} from "../events/lead-event-factory.js";
import { LeadConflictError, LeadNotFoundError, LeadValidationError } from "../errors.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
} from "../ports/lead-platform-ports.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import type {
  AssignmentMethod,
  LeadLifecycleStatus,
  LeadRecord,
  LeadServiceContext,
} from "../types/lead-types.js";
import { toLeadSummary } from "../types/lead-types.js";
import {
  assertLeadActor,
  assertLeadCompanyAccess,
  assertLeadPermission,
  readOptionalString,
  readRequiredString,
} from "../validators/lead-guards.js";
import { assertStageTransition, selectAssignmentCandidate } from "../validators/stage-transition-validator.js";

export type LeadCommandServiceDeps = {
  leads: LeadRepository;
  assignees: LeadAssigneeResolverPort;
  conversion: LeadConversionPort;
  events: LeadEventPublisherPort;
  notifications: LeadNotificationPort;
  audit: LeadAuditPort;
};

export class LeadCommandService {
  constructor(private readonly deps: LeadCommandServiceDeps) {}

  async createLead(
    ctx: LeadServiceContext,
    input: {
      companyId: string;
      title: string;
      contactName?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      sourceId?: string;
      stageId?: string;
      assignedUserId?: string;
      conversationId?: string;
      priority?: LeadRecord["priority"];
      estimatedValue?: number;
      expectedCloseDate?: string | null;
      temperature?: LeadRecord["temperature"];
      notes?: string;
      tags?: string[];
      pipelineId?: string;
      territory?: string;
      department?: string;
      language?: string;
      isVip?: boolean;
      aiSummary?: string;
      metadata?: Record<string, unknown>;
      currency?: string;
    },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.create);

    const pipelineId = input.pipelineId ?? (await this.deps.leads.ensureDefaultPipeline(input.companyId));
    const defaultStage = await this.deps.leads.getDefaultStage(input.companyId, pipelineId);
    if (!defaultStage) throw new LeadValidationError("Default pipeline stage not found.");

    let stageId = input.stageId ?? defaultStage.id;
    let lifecycleStatus: LeadRecord["lifecycleStatus"] = defaultStage.lifecycleStatus;
    if (input.stageId) {
      const stage = await this.deps.leads.getStage(input.companyId, input.stageId);
      if (!stage) throw new LeadValidationError("Stage not found.");
      stageId = stage.id;
      lifecycleStatus = stage.lifecycleStatus;
    }

    const nowIso = new Date().toISOString();
    const record = await this.deps.leads.createLead({
      companyId: input.companyId,
      pipelineId,
      stageId,
      sourceId: input.sourceId ?? null,
      lifecycleStatus,
      title: readRequiredString(input.title, "Title"),
      contactName: readOptionalString(input.contactName),
      email: readOptionalString(input.email) ?? null,
      phone: readOptionalString(input.phone) ?? null,
      companyName: readOptionalString(input.companyName) ?? null,
      priority: input.priority,
      estimatedValue: input.estimatedValue ?? null,
      conversationId: input.conversationId ?? null,
      territory: input.territory ?? null,
      department: input.department ?? null,
      language: input.language ?? null,
      assignedUserId: input.assignedUserId ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      temperature: input.temperature ?? null,
      notes: input.notes ?? "",
      tags: input.tags ?? [],
      lastActivityAt: nowIso,
      isVip: input.isVip ?? false,
      aiSummary: input.aiSummary ?? "",
      metadata: input.metadata ?? {},
      currency: input.currency?.trim().toUpperCase() || null,
      createdBy: actorUserId,
    });

    if (input.assignedUserId) {
      await this.deps.leads.createAssignment({
        companyId: input.companyId,
        leadId: record.id,
        assignedUserId: input.assignedUserId,
        assignmentMethod: "manual",
        assignedBy: actorUserId,
      });
    }

    if (input.notes?.trim()) {
      await this.deps.leads.addNote({
        companyId: input.companyId,
        leadId: record.id,
        body: input.notes.trim(),
        isInternal: false,
        createdBy: actorUserId,
      });
    }

    for (const tag of input.tags ?? []) {
      const cleaned = tag.trim();
      if (!cleaned) continue;
      await this.deps.leads.addTag({
        companyId: input.companyId,
        leadId: record.id,
        tag: cleaned,
        createdBy: actorUserId,
      });
    }

    await this.recordActivity(input.companyId, record.id, "created", "Lead created", actorUserId);
    await this.deps.events.publish(createLeadCreatedEvent(record, actorUserId));
    await this.writeAudit(input.companyId, actorUserId, "CREATE", "lead", record.id, { title: record.title });

    return { lead: record };
  }

  async updateLead(
    ctx: LeadServiceContext,
    input: {
      companyId: string;
      leadId: string;
      title?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      priority?: LeadRecord["priority"];
      estimatedValue?: number;
      score?: number;
      sourceId?: string | null;
      stageId?: string;
      assignedUserId?: string | null;
      expectedCloseDate?: string | null;
      temperature?: LeadRecord["temperature"];
      notes?: string;
      tags?: string[];
      aiSummary?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    await this.requireLead(input.companyId, input.leadId);

    let lifecycleStatus: LeadRecord["lifecycleStatus"] | undefined;
    if (input.stageId) {
      const stage = await this.deps.leads.getStage(input.companyId, input.stageId);
      if (!stage) throw new LeadValidationError("Stage not found.");
      lifecycleStatus = stage.lifecycleStatus;
    }

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      title: input.title != null ? readRequiredString(input.title, "Title") : undefined,
      contactName: input.contactName,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      companyName: input.companyName ?? undefined,
      priority: input.priority,
      estimatedValue: input.estimatedValue,
      score: input.score,
      sourceId: input.sourceId,
      stageId: input.stageId,
      lifecycleStatus,
      assignedUserId: input.assignedUserId,
      expectedCloseDate: input.expectedCloseDate,
      temperature: input.temperature,
      notes: input.notes,
      tags: input.tags,
      lastActivityAt: new Date().toISOString(),
      aiSummary: input.aiSummary,
      metadata: input.metadata,
    });

    if (input.assignedUserId) {
      await this.deps.leads.deactivateAssignments(input.companyId, input.leadId);
      await this.deps.leads.createAssignment({
        companyId: input.companyId,
        leadId: input.leadId,
        assignedUserId: input.assignedUserId,
        assignmentMethod: "manual",
        assignedBy: actorUserId,
      });
    }

    if (input.notes != null && input.notes.trim()) {
      await this.deps.leads.addNote({
        companyId: input.companyId,
        leadId: input.leadId,
        body: input.notes.trim(),
        isInternal: false,
        createdBy: actorUserId,
      });
    }

    if (input.tags) {
      const existing = await this.deps.leads.listTags(input.companyId, input.leadId);
      for (const tag of existing) {
        await this.deps.leads.removeTag(input.companyId, input.leadId, tag.tag);
      }
      for (const tag of input.tags) {
        const cleaned = tag.trim();
        if (!cleaned) continue;
        await this.deps.leads.addTag({
          companyId: input.companyId,
          leadId: input.leadId,
          tag: cleaned,
          createdBy: actorUserId,
        });
      }
    }

    await this.deps.events.publish(createLeadUpdatedEvent(record, actorUserId, input));
    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "lead", input.leadId, { patch: input });
    return { lead: record };
  }

  async deleteLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ success: true }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    await this.requireLead(input.companyId, input.leadId);

    await this.deps.leads.softDeleteLead(input.companyId, input.leadId, actorUserId);
    await this.deps.events.publish(
      createLeadDeletedEvent({ companyId: input.companyId, leadId: input.leadId, actorUserId }),
    );
    await this.writeAudit(input.companyId, actorUserId, "DELETE", "lead", input.leadId, {});
    return { success: true };
  }

  async assignLead(
    ctx: LeadServiceContext,
    input: {
      companyId: string;
      leadId: string;
      assigneeUserId?: string;
      method?: AssignmentMethod;
    },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.assign);

    const existing = await this.requireLead(input.companyId, input.leadId);
    const method = input.method ?? "manual";
    let assigneeUserId = input.assigneeUserId;

    if (!assigneeUserId) {
      const candidates = await this.deps.assignees.listAssigneeCandidates({
        companyId: input.companyId,
        territory: existing.territory,
        department: existing.department,
        language: existing.language,
      });
      assigneeUserId = selectAssignmentCandidate(candidates, method, existing.isVip) ?? undefined;
    }

    if (!assigneeUserId) throw new LeadValidationError("No assignee available.");

    const isReassign = Boolean(existing.assignedUserId);
    await this.deps.leads.createAssignment({
      companyId: input.companyId,
      leadId: input.leadId,
      assignedUserId: assigneeUserId,
      assignmentMethod: method,
      assignedBy: actorUserId,
    });

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      assignedUserId: assigneeUserId,
    });

    await this.recordHistory(input.companyId, input.leadId, "assigned_user_id", existing.assignedUserId, assigneeUserId, "assign", actorUserId);
    await this.deps.events.publish(
      createLeadAssignedEvent({
        companyId: input.companyId,
        leadId: input.leadId,
        assignedUserId: assigneeUserId,
        method,
        actorUserId,
        isReassign,
      }),
    );
    await this.deps.notifications.notify({
      kind: "assignment",
      companyId: input.companyId,
      leadId: input.leadId,
      actorUserId,
      recipientUserId: assigneeUserId,
    });

    return { lead: record };
  }

  async reassignLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; assigneeUserId: string },
  ): Promise<{ lead: LeadRecord }> {
    return this.assignLead(ctx, { ...input, method: "manual" });
  }

  async qualifyLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; score?: number },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.qualify);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const stage = await this.resolveStageByStatus(input.companyId, existing.pipelineId, "qualified");
    assertStageTransition(existing.lifecycleStatus, "qualified");

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      isQualified: true,
      lifecycleStatus: "qualified",
      stageId: stage?.id ?? existing.stageId,
      score: input.score ?? existing.score,
      qualifiedAt: new Date().toISOString(),
    });

    await this.deps.events.publish(
      createLeadQualifiedEvent({ companyId: input.companyId, leadId: input.leadId, qualified: true, actorUserId }),
    );
    return { lead: record };
  }

  async disqualifyLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.qualify);
    await this.requireLead(input.companyId, input.leadId);

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      isQualified: false,
      qualifiedAt: null,
    });

    await this.deps.events.publish(
      createLeadQualifiedEvent({ companyId: input.companyId, leadId: input.leadId, qualified: false, actorUserId }),
    );
    return { lead: record };
  }

  async convertLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ lead: LeadRecord; customerId: string }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.convert);
    const existing = await this.requireLead(input.companyId, input.leadId);

    if (existing.customerId) {
      throw new LeadConflictError("Lead is already converted.");
    }

    const [tags, notes, activities] = await Promise.all([
      this.deps.leads.listTags(input.companyId, input.leadId),
      this.deps.leads.listNotes(input.companyId, input.leadId),
      this.deps.leads.listActivities(input.companyId, input.leadId, 50),
    ]);

    const preservedPayload = {
      tags: tags.map((t) => t.tag),
      notes: notes.map((n) => ({ body: n.body, createdAt: n.createdAt })),
      activities,
      sourceId: existing.sourceId,
      conversationId: existing.conversationId,
      aiSummary: existing.aiSummary,
      score: existing.score,
      metadata: existing.metadata,
    };

    const converted = await this.deps.conversion.convertLead({
      companyId: input.companyId,
      leadId: input.leadId,
      contactName: existing.contactName || existing.title,
      email: existing.email,
      phone: existing.phone,
      companyName: existing.companyName,
      actorUserId,
      preservedPayload,
    });

    const stage = await this.resolveStageByStatus(input.companyId, existing.pipelineId, "converted");
    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      customerId: converted.customerId,
      lifecycleStatus: "converted",
      stageId: stage?.id ?? existing.stageId,
      convertedAt: new Date().toISOString(),
    });

    await this.deps.leads.recordConversion({
      companyId: input.companyId,
      leadId: input.leadId,
      customerId: converted.customerId,
      opportunityId: converted.opportunityId ?? null,
      convertedBy: actorUserId,
      preservedPayload,
    });

    await this.recordActivity(input.companyId, input.leadId, "converted", `Converted to customer ${converted.customerId}`, actorUserId);
    await this.deps.events.publish(
      createLeadConvertedEvent({
        companyId: input.companyId,
        leadId: input.leadId,
        customerId: converted.customerId,
        actorUserId,
      }),
    );

    return { lead: record, customerId: converted.customerId };
  }

  async mergeLead(
    ctx: LeadServiceContext,
    input: { companyId: string; primaryLeadId: string; duplicateLeadIds: string[] },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.merge);

    const record = await this.deps.leads.mergeLeads({
      companyId: input.companyId,
      primaryLeadId: input.primaryLeadId,
      duplicateLeadIds: input.duplicateLeadIds,
      updatedBy: actorUserId,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "lead", input.primaryLeadId, {
      merged: input.duplicateLeadIds,
    });
    return { lead: record };
  }

  async archiveLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.archive);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const stage = await this.resolveStageByStatus(input.companyId, existing.pipelineId, "archived");
    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      lifecycleStatus: "archived",
      stageId: stage?.id ?? existing.stageId,
      archivedAt: new Date().toISOString(),
    });

    await this.deps.events.publish(
      createLeadArchivedEvent({ companyId: input.companyId, leadId: input.leadId, archived: true, actorUserId }),
    );
    return { lead: record };
  }

  async restoreLead(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.archive);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const stage = await this.resolveStageByStatus(input.companyId, existing.pipelineId, "new");
    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      lifecycleStatus: "new",
      stageId: stage?.id ?? existing.stageId,
      archivedAt: null,
    });

    await this.deps.events.publish(
      createLeadArchivedEvent({ companyId: input.companyId, leadId: input.leadId, archived: false, actorUserId }),
    );
    return { lead: record };
  }

  async addLeadNote(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; body: string; isInternal?: boolean },
  ): Promise<{ note: import("../types/lead-types.js").LeadNoteRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    await this.requireLead(input.companyId, input.leadId);

    const note = await this.deps.leads.addNote({
      companyId: input.companyId,
      leadId: input.leadId,
      body: readRequiredString(input.body, "Note body"),
      isInternal: input.isInternal ?? true,
      createdBy: actorUserId,
    });

    await this.recordActivity(input.companyId, input.leadId, "note_added", "Note added", actorUserId);
    return { note };
  }

  async addLeadTag(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; tag: string },
  ): Promise<{ tag: import("../types/lead-types.js").LeadTagRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    await this.requireLead(input.companyId, input.leadId);

    const tag = await this.deps.leads.addTag({
      companyId: input.companyId,
      leadId: input.leadId,
      tag: readRequiredString(input.tag, "Tag"),
      createdBy: actorUserId,
    });
    return { tag };
  }

  async removeLeadTag(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; tag: string },
  ): Promise<{ success: true }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    await this.deps.leads.removeTag(input.companyId, input.leadId, readRequiredString(input.tag, "Tag"));
    await this.recordActivity(input.companyId, input.leadId, "tag_removed", `Removed tag: ${input.tag}`, actorUserId);
    return { success: true };
  }

  async changeLeadStage(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; stageId: string },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.edit);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const stage = await this.deps.leads.getStage(input.companyId, input.stageId);
    if (!stage) throw new LeadNotFoundError("Stage", input.stageId);

    if (stage.pipelineId !== existing.pipelineId) {
      throw new LeadValidationError("Stage does not belong to the lead pipeline.");
    }

    const pipeline = await this.deps.leads.getPipeline(input.companyId, existing.pipelineId);
    assertStageTransition(existing.lifecycleStatus, stage.lifecycleStatus, {
      allowBackward: pipeline?.allowBackwardStageMovement ?? true,
    });

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      stageId: stage.id,
      lifecycleStatus: stage.lifecycleStatus,
      isQualified: stage.lifecycleStatus === "qualified" ? true : existing.isQualified,
    });

    await this.recordHistory(input.companyId, input.leadId, "stage_id", existing.stageId, stage.id, "change_stage", actorUserId);
    await this.deps.events.publish(
      createLeadStageChangedEvent({
        companyId: input.companyId,
        leadId: input.leadId,
        previousStageId: existing.stageId,
        newStageId: stage.id,
        lifecycleStatus: stage.lifecycleStatus,
        actorUserId,
      }),
    );
    await this.deps.notifications.notify({
      kind: "stage_change",
      companyId: input.companyId,
      leadId: input.leadId,
      actorUserId,
      metadata: { stageId: stage.id },
    });

    return { lead: record };
  }

  async changePipeline(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; pipelineId: string },
  ): Promise<{ lead: LeadRecord }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.manage);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const pipeline = await this.deps.leads.getPipeline(input.companyId, input.pipelineId);
    if (!pipeline) throw new LeadNotFoundError("Pipeline", input.pipelineId);

    const stage = await this.deps.leads.getDefaultStage(input.companyId, input.pipelineId);
    if (!stage) throw new LeadValidationError("Target pipeline has no stages.");

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      pipelineId: input.pipelineId,
      stageId: stage.id,
      lifecycleStatus: stage.lifecycleStatus,
    });

    await this.deps.events.publish(
      createLeadPipelineChangedEvent({
        companyId: input.companyId,
        leadId: input.leadId,
        previousPipelineId: existing.pipelineId,
        newPipelineId: input.pipelineId,
        actorUserId,
      }),
    );
    return { lead: record };
  }

  private async requireLead(companyId: string, leadId: string): Promise<LeadRecord> {
    const lead = await this.deps.leads.getLead(companyId, leadId);
    if (!lead) throw new LeadNotFoundError("Lead", leadId);
    return lead;
  }

  private async resolveStageByStatus(companyId: string, pipelineId: string, status: LeadLifecycleStatus) {
    const stages = await this.deps.leads.listStages(companyId, pipelineId);
    return stages.find((s) => s.lifecycleStatus === status) ?? null;
  }

  private async recordActivity(
    companyId: string,
    leadId: string,
    activityType: string,
    summary: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.deps.leads.appendActivity({ companyId, leadId, activityType, summary, actorUserId });
  }

  private async recordHistory(
    companyId: string,
    leadId: string,
    fieldName: string,
    previousValue: string | null,
    newValue: string | null,
    action: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.deps.leads.appendHistory({
      companyId,
      leadId,
      fieldName,
      previousValue,
      newValue,
      changeAction: action,
      actorUserId,
    });
  }

  private async writeAudit(
    companyId: string,
    userId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    entity: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.audit.write({ companyId, userId, action, entity, entityId, metadata });
  }
}

export { toLeadSummary };
