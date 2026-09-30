import {
  LEAD_CONVERSION_CLAIM_TTL_SECONDS,
  LEAD_CONVERSION_MODES,
  LEAD_CONVERSION_OPPORTUNITY_PERMISSION,
  LEAD_PERMISSIONS,
} from "../constants.js";
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
import {
  LeadConflictError,
  LeadNotFoundError,
  LeadPermissionDeniedError,
  LeadValidationError,
} from "../errors.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
  LeadOpportunityConversionPort,
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
import {
  AssignmentGovernanceError,
  type AssignmentGovernancePort,
} from "@workspace/assignment-governance";
import type { AssignmentAuditPort, AssignmentAuditSource } from "@workspace/assignment-audit";

export type LeadCommandServiceDeps = {
  leads: LeadRepository;
  assignees: LeadAssigneeResolverPort;
  conversion: LeadConversionPort;
  events: LeadEventPublisherPort;
  notifications: LeadNotificationPort;
  audit: LeadAuditPort;
  assignmentGovernance?: AssignmentGovernancePort | null;
  assignmentAudit?: AssignmentAuditPort | null;
  opportunityConversion?: LeadOpportunityConversionPort | null;
};

export type LeadConversionMode = (typeof LEAD_CONVERSION_MODES)[number];

export type LeadConversionResult = {
  lead: LeadRecord;
  customerId: string;
  opportunityId: string | null;
  mode: LeadConversionMode;
  /** true = new customer, false = existing customer reused, null = linked earlier (resume/replay). */
  customerCreated: boolean | null;
  /** true = new opportunity, false = existing lead opportunity reused, null = not requested. */
  opportunityCreated: boolean | null;
  /** The lead was already converted before this request — nothing was written. */
  alreadyConverted: boolean;
};

function isFinalConvertedLead(lead: LeadRecord): boolean {
  return Boolean(lead.customerId) && (lead.lifecycleStatus === "converted" || lead.lifecycleStatus === "won");
}

export class LeadCommandService {
  constructor(private readonly deps: LeadCommandServiceDeps) {}

  private async assertAssignableEmployee(actorUserId: string, targetUserId: string): Promise<void> {
    if (!this.deps.assignmentGovernance) return;
    try {
      await this.deps.assignmentGovernance.assertCanAssignToEmployee({
        actorUserId,
        targetUserId,
        resource: "lead",
      });
    } catch (error) {
      if (error instanceof AssignmentGovernanceError) {
        throw new LeadPermissionDeniedError(
          `${LEAD_PERMISSIONS.assign} (${error.code}: ${error.message})`,
        );
      }
      throw error;
    }
  }

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
    if (input.assignedUserId) {
      await this.assertAssignableEmployee(actorUserId, input.assignedUserId);
    }
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

    if (input.assignedUserId && this.deps.assignmentAudit) {
      await this.deps.assignmentAudit.recordAssignmentChange({
        companyId: input.companyId,
        actorUserId,
        resourceType: "lead",
        resourceId: record.id,
        previousAssigneeUserId: null,
        newAssigneeUserId: input.assignedUserId,
        source: "human",
      });
    }

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
    const existing = await this.requireLead(input.companyId, input.leadId);

    if (input.assignedUserId) {
      await this.assertAssignableEmployee(actorUserId, input.assignedUserId);
    }

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

    if (input.assignedUserId !== undefined && this.deps.assignmentAudit) {
      await this.deps.assignmentAudit.recordAssignmentChange({
        companyId: input.companyId,
        actorUserId,
        resourceType: "lead",
        resourceId: input.leadId,
        previousAssigneeUserId: existing.assignedUserId,
        newAssigneeUserId: input.assignedUserId,
        source: "human",
      });
    }

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
      assignmentAuditSource?: AssignmentAuditSource;
      skipAssignmentAudit?: boolean;
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

    await this.assertAssignableEmployee(actorUserId, assigneeUserId);

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

    if (this.deps.assignmentAudit && !input.skipAssignmentAudit) {
      await this.deps.assignmentAudit.recordAssignmentChange({
        companyId: input.companyId,
        actorUserId,
        resourceType: "lead",
        resourceId: input.leadId,
        previousAssigneeUserId: existing.assignedUserId,
        newAssigneeUserId: assigneeUserId,
        source: input.assignmentAuditSource ?? (method === "manual" ? "human" : "system"),
      });
    }

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

  /**
   * Lead → Customer (default) or Lead → Customer + Opportunity.
   *
   * No database transaction spans customer/opportunity/lead writes (separate services over
   * RLS). Safety comes from ordering + idempotency instead:
   *   1. per-lead DB claim blocks concurrent conversions (double-click, parallel tabs);
   *   2. customer is linked first (reused by email when it exists);
   *   3. opportunity is ensured via the Opportunity platform (reuses the lead's opportunity);
   *   4. only then is the lead marked "converted".
   * A failure before step 4 leaves a resumable lead (customer linked, not converted) and a
   * retry continues from there — never "converted" with the requested opportunity missing.
   */
  async convertLead(
    ctx: LeadServiceContext,
    input: {
      companyId: string;
      leadId: string;
      mode?: LeadConversionMode;
      /** Company billing currency used by Opportunity defaults when the lead has none. */
      companyDefaultCurrency?: string;
    },
  ): Promise<LeadConversionResult> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.convert);

    const mode: LeadConversionMode = input.mode ?? "customer";
    if (!(LEAD_CONVERSION_MODES as readonly string[]).includes(mode)) {
      throw new LeadValidationError("Invalid lead conversion mode.");
    }
    const withOpportunity = mode === "customer_and_opportunity";
    const opportunityPort = this.deps.opportunityConversion ?? null;
    if (withOpportunity) {
      if (!opportunityPort) {
        throw new LeadValidationError("Opportunity creation is not available for lead conversion.");
      }
      assertLeadPermission(ctx, LEAD_CONVERSION_OPPORTUNITY_PERMISSION);
    }

    const existing = await this.requireLead(input.companyId, input.leadId);
    if (isFinalConvertedLead(existing)) {
      return this.replayConvertedLead(existing, mode);
    }

    if (withOpportunity) {
      await opportunityPort!.assertCanCreateForLead(ctx, {
        companyId: input.companyId,
        leadId: input.leadId,
        companyDefaultCurrency: input.companyDefaultCurrency,
      });
    }

    const claimId = crypto.randomUUID();
    const claimSupported = typeof this.deps.leads.tryClaimConversion === "function";
    if (claimSupported) {
      const claimed = await this.deps.leads.tryClaimConversion!({
        companyId: input.companyId,
        leadId: input.leadId,
        claimId,
        ttlSeconds: LEAD_CONVERSION_CLAIM_TTL_SECONDS,
      });
      if (!claimed) {
        throw new LeadConflictError(
          "This lead is already being converted. Refresh in a moment to see the result.",
        );
      }
    }

    try {
      // A concurrent conversion may have finished between the first read and our claim.
      const current = claimSupported ? await this.requireLead(input.companyId, input.leadId) : existing;
      if (isFinalConvertedLead(current)) {
        return this.replayConvertedLead(current, mode);
      }
      return await this.runLeadConversion(ctx, actorUserId, current, {
        companyId: input.companyId,
        mode,
        companyDefaultCurrency: input.companyDefaultCurrency,
      });
    } finally {
      if (claimSupported) {
        await this.deps.leads
          .releaseConversionClaim?.({ companyId: input.companyId, leadId: input.leadId, claimId })
          .catch(() => undefined);
      }
    }
  }

  private async replayConvertedLead(
    lead: LeadRecord,
    mode: LeadConversionMode,
  ): Promise<LeadConversionResult> {
    const found =
      mode === "customer_and_opportunity" && this.deps.opportunityConversion
        ? await this.deps.opportunityConversion.findOpportunityForLead({
            companyId: lead.companyId,
            leadId: lead.id,
          })
        : null;
    return {
      lead,
      customerId: lead.customerId!,
      opportunityId: found?.opportunityId ?? null,
      mode,
      customerCreated: null,
      opportunityCreated: found ? false : null,
      alreadyConverted: true,
    };
  }

  private async runLeadConversion(
    ctx: LeadServiceContext,
    actorUserId: string,
    existing: LeadRecord,
    input: { companyId: string; mode: LeadConversionMode; companyDefaultCurrency?: string },
  ): Promise<LeadConversionResult> {
    const leadId = existing.id;
    // Keep convert fast — tags/notes only (skip activity history transfer).
    const [tags, notes] = await Promise.all([
      this.deps.leads.listTags(input.companyId, leadId),
      this.deps.leads.listNotes(input.companyId, leadId),
    ]);

    const preservedPayload = {
      tags: tags.map((t) => t.tag),
      notes: notes.map((n) => ({ body: n.body, createdAt: n.createdAt })),
      sourceId: existing.sourceId,
      conversationId: existing.conversationId,
      aiSummary: existing.aiSummary,
      score: existing.score,
      metadata: existing.metadata,
    };

    // Resume a partial conversion (customer already linked, status not finalized yet).
    let customerId: string;
    let customerCreated: boolean | null = null;
    let portOpportunityId: string | null = null;
    if (existing.customerId) {
      customerId = existing.customerId;
    } else {
      const converted = await this.deps.conversion.convertLead({
        companyId: input.companyId,
        leadId,
        contactName: existing.contactName || existing.title,
        email: existing.email,
        phone: existing.phone,
        companyName: existing.companyName,
        actorUserId,
        preservedPayload,
      });
      customerId = converted.customerId;
      customerCreated = typeof converted.customerCreated === "boolean" ? converted.customerCreated : null;
      portOpportunityId = converted.opportunityId ?? null;
    }

    let opportunityId = portOpportunityId;
    let opportunityCreated: boolean | null = null;
    if (input.mode === "customer_and_opportunity") {
      const ensured = await this.deps.opportunityConversion!.ensureOpportunityForLead(ctx, {
        companyId: input.companyId,
        leadId,
        companyDefaultCurrency: input.companyDefaultCurrency,
      });
      opportunityId = ensured.opportunityId;
      opportunityCreated = ensured.created;
    }

    const stage = await this.resolveStageByStatus(input.companyId, existing.pipelineId, "converted");
    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId,
      updatedBy: actorUserId,
      customerId,
      lifecycleStatus: "converted",
      stageId: stage?.id ?? existing.stageId,
      convertedAt: new Date().toISOString(),
    });

    await this.deps.leads.recordConversion({
      companyId: input.companyId,
      leadId,
      customerId,
      opportunityId,
      convertedBy: actorUserId,
      preservedPayload,
    });

    const customerOutcome =
      customerCreated === true ? "created" : customerCreated === false ? "reused" : "linked";
    const opportunityOutcome =
      opportunityCreated === true ? "created" : opportunityCreated === false ? "reused" : null;
    await this.deps.leads.appendActivity({
      companyId: input.companyId,
      leadId,
      activityType: "converted",
      summary:
        input.mode === "customer_and_opportunity" && opportunityId
          ? `Converted to customer ${customerId} (${customerOutcome}) and opportunity ${opportunityId} (${opportunityOutcome})`
          : `Converted to customer ${customerId}`,
      payload: {
        mode: input.mode,
        customerId,
        customerOutcome,
        opportunityId,
        opportunityOutcome,
      },
      actorUserId,
    });
    await this.deps.events.publish(
      createLeadConvertedEvent({
        companyId: input.companyId,
        leadId,
        customerId,
        opportunityId,
        actorUserId,
      }),
    );

    return {
      lead: record,
      customerId,
      opportunityId,
      mode: input.mode,
      customerCreated,
      opportunityCreated,
      alreadyConverted: false,
    };
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
