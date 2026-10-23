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
  LeadQualificationPolicyRejectedError,
  LeadStageTransitionError,
  LeadValidationError,
} from "../errors.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
  LeadOpportunityConversionPort,
  LeadOpportunityStageSyncPort,
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
import { leadsShareVerifiedIdentity } from "../validators/lead-merge-identity.js";
import {
  assertStageTransition,
  selectAssignmentCandidate,
  type StageAuditSource,
} from "../validators/stage-transition-validator.js";
import {
  extractSalesEvidenceFromConversation,
  salesEvidenceAuditSnapshot,
} from "../policies/conversation-sales-evidence.js";
import {
  AssignmentGovernanceError,
  type AssignmentGovernancePort,
} from "@workspace/assignment-governance";
import type { AssignmentAuditPort, AssignmentAuditSource } from "@workspace/assignment-audit";
import {
  evaluateLeadQualificationPolicy,
  type LeadQualificationEvaluation,
  type SalesEvidence,
} from "../policies/lead-qualification-policy.js";
import {
  companyLeadQualificationSettingsToPatch,
  type CompanyLeadQualificationSettings,
  type CompanyLeadQualificationSettingsPatch,
  type CompanyLeadQualificationSettingsStore,
  resolveCompanyLeadQualificationPolicyConfig,
} from "../policies/company-lead-qualification-settings.js";
import {
  deriveObservationalSalesEvidence,
  mergeSalesEvidence,
  resolveQualificationPolicyMode,
  type QualificationPolicyMode,
} from "../policies/qualify-lead-policy-integration.js";

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
  /**
   * Optional: synchronize linked Opportunity stage after Lead Kanban / changeLeadStage.
   * Never creates Opportunities and never triggers external sends.
   */
  opportunityStageSync?: LeadOpportunityStageSyncPort | null;
  /**
   * Accepted-quote proof for Won. Missing or false blocks every caller, including Kanban drag.
   * There is no payment field; an accepted quote is the persisted sale record.
   */
  saleCompletion?: {
    hasAcceptedQuoteForLead(input: { companyId: string; leadId: string }): Promise<boolean>;
  } | null;
  /**
   * Company qualification settings (P1d). Prefer Supabase store in production;
   * InMemory for tests. When null/omitted, motion defaults from P1a/P1b are used.
   */
  qualificationSettingsStore?: CompanyLeadQualificationSettingsStore | null;
};

export type QualifyLeadInput = {
  companyId: string;
  leadId: string;
  score?: number;
  stageId?: string;
  /** Caller-supplied sales evidence. Missing keys are not treated as true. */
  evidence?: SalesEvidence;
  /**
   * `enforce` — AI / automated paths.
   * `human_override` — Kanban / CRM / Integration API.
   * Omitted — see resolveQualificationPolicyMode (legacy compatibility).
   */
  qualificationPolicyMode?: QualificationPolicyMode;
  /** Optional per-request settings patch (merged via P1b normalize). */
  companySettingsPatch?: CompanyLeadQualificationSettingsPatch | null;
  /** Inbound event id that produced this decision. Not message text. */
  messageId?: string;
  auditSource?: StageAuditSource;
  auditReason?: string;
};

export type ConversationQualificationInput = {
  companyId: string;
  leadId: string;
  messageId: string;
  texts: readonly string[];
};

export type ConversationQualificationResult = {
  duplicate: boolean;
  qualificationApplied: boolean;
  outcome: string;
  reason: string;
};

export type QualifyLeadResult = {
  lead: LeadRecord;
  /** Policy evaluation or explicit skip reason for truthful callers. */
  policy: LeadQualificationEvaluation | {
    outcome: "qualified";
    reason: "policy_skipped_human_override" | "policy_skipped_legacy_caller";
    explanation: string;
    missingRequiredEvidence: [];
    requiresHumanReview: false;
    salesMotion: string;
    requiredEvidenceFields: string[];
  };
  /** True when this call persisted a new qualification transition. */
  qualificationApplied: boolean;
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

function formatLeadPurchaseJourney(input: {
  lead: LeadRecord;
  stageName: ReadonlyMap<string, string>;
  history: Array<{ fieldName: string; previousValue: string | null; newValue: string | null; createdAt: string }>;
  activities: Array<{ summary: string; activityType: string; createdAt: string }>;
  notes: Array<{ body: string; createdAt: string }>;
  tags: string[];
}): string {
  const stageLabel = (id: string | null) => {
    if (!id) return "—";
    return input.stageName.get(id) ?? id;
  };
  const lines = [
    "رحلة شراء المنتج",
    `الاسم: ${input.lead.contactName || input.lead.title}`,
    input.lead.email ? `البريد: ${input.lead.email}` : "",
    input.lead.phone ? `الهاتف: ${input.lead.phone}` : "",
    input.lead.companyName ? `الشركة: ${input.lead.companyName}` : "",
    input.lead.estimatedValue != null ? `القيمة المتوقعة: ${input.lead.estimatedValue} ${input.lead.currency}` : "",
    input.tags.length ? `الوسوم: ${input.tags.join("، ")}` : "",
    "",
    "المراحل",
  ];
  const stageMoves = input.history.filter((row) => row.fieldName === "stage_id" || row.fieldName === "lifecycle_status");
  if (stageMoves.length === 0) {
    lines.push(`- الحالة الحالية: ${input.lead.lifecycleStatus}`);
  } else {
    for (const row of stageMoves) {
      const from = row.fieldName === "stage_id" ? stageLabel(row.previousValue) : row.previousValue ?? "—";
      const to = row.fieldName === "stage_id" ? stageLabel(row.newValue) : row.newValue ?? "—";
      lines.push(`- ${row.createdAt}: ${from} ← ${to}`);
    }
  }
  if (input.activities.length) {
    lines.push("", "الأنشطة");
    for (const activity of input.activities) {
      lines.push(`- ${activity.createdAt}: ${activity.summary || activity.activityType}`);
    }
  }
  if (input.notes.length) {
    lines.push("", "الملاحظات");
    for (const note of input.notes) {
      lines.push(`- ${note.createdAt}: ${note.body}`);
    }
  }
  return lines.filter((line) => line !== "").join("\n");
}

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
      customerId?: string | null;
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
      customerId: input.customerId?.trim() || null,
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
      customerId?: string | null;
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
      customerId: input.customerId !== undefined ? input.customerId?.trim() || null : undefined,
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

  /**
   * Qualify from stored conversation text. Model-filled evidence is not accepted here.
   * A repeated message id, or an already-qualified lead, does not publish another event.
   */
  async applyConversationQualification(
    ctx: LeadServiceContext,
    input: ConversationQualificationInput,
  ): Promise<ConversationQualificationResult> {
    assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.qualify);
    const existing = await this.requireLead(input.companyId, input.leadId);
    const priorMessageId =
      typeof existing.metadata.salesQualificationMessageId === "string"
        ? existing.metadata.salesQualificationMessageId
        : "";
    if (priorMessageId && priorMessageId === input.messageId) {
      return {
        duplicate: true,
        qualificationApplied: false,
        outcome: typeof existing.metadata.salesQualificationOutcome === "string"
          ? existing.metadata.salesQualificationOutcome
          : existing.isQualified
            ? "already_qualified"
            : "duplicate",
        reason: "message_already_processed",
      };
    }

    const evidence = extractSalesEvidenceFromConversation(input.texts);
    try {
      const result = await this.qualifyLead(ctx, {
        companyId: input.companyId,
        leadId: input.leadId,
        evidence,
        qualificationPolicyMode: "enforce",
        messageId: input.messageId,
        auditSource: "ai",
        auditReason: "conversation_evidence",
      });
      return {
        duplicate: result.policy.outcome === "already_qualified",
        qualificationApplied: result.qualificationApplied,
        outcome: result.policy.outcome,
        reason: result.policy.reason,
      };
    } catch (error) {
      if (error instanceof LeadQualificationPolicyRejectedError) {
        return {
          duplicate: false,
          qualificationApplied: false,
          outcome: error.evaluation.outcome,
          reason: error.evaluation.reason,
        };
      }
      if (error instanceof LeadStageTransitionError) {
        return {
          duplicate: false,
          qualificationApplied: false,
          outcome: "stage_transition_blocked",
          reason: error.reason,
        };
      }
      throw error;
    }
  }

  async qualifyLead(ctx: LeadServiceContext, input: QualifyLeadInput): Promise<QualifyLeadResult> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.qualify);
    const existing = await this.requireLead(input.companyId, input.leadId);

    const evidencePropertyProvided = Object.prototype.hasOwnProperty.call(input, "evidence");
    const policyMode = resolveQualificationPolicyMode({
      qualificationPolicyMode: input.qualificationPolicyMode,
      evidencePropertyProvided,
    });

    const settingsPatch = await this.resolveSettingsPatchForQualify(input);
    const { policyConfig, settings } = resolveCompanyLeadQualificationPolicyConfig(
      input.companyId,
      settingsPatch,
    );

    let policyResult: QualifyLeadResult["policy"];
    const evidence = mergeSalesEvidence(deriveObservationalSalesEvidence(existing), input.evidence);

    if (policyMode === "enforce") {
      const evaluation = evaluateLeadQualificationPolicy({
        lead: {
          isQualified: existing.isQualified,
          score: existing.score,
          temperature: existing.temperature,
          lifecycleStatus: existing.lifecycleStatus,
        },
        evidence,
        config: policyConfig,
      });
      policyResult = evaluation;

      if (evaluation.outcome === "already_qualified") {
        return { lead: existing, policy: evaluation, qualificationApplied: false };
      }
      if (evaluation.outcome !== "qualified") {
        throw new LeadQualificationPolicyRejectedError({
          outcome: evaluation.outcome,
          reason: evaluation.reason,
          explanation: evaluation.explanation,
          missingRequiredEvidence: [...evaluation.missingRequiredEvidence],
          requiresHumanReview: evaluation.requiresHumanReview,
        });
      }
    } else {
      policyResult = {
        outcome: "qualified",
        reason:
          input.qualificationPolicyMode === "human_override"
            ? "policy_skipped_human_override"
            : "policy_skipped_legacy_caller",
        explanation:
          "Qualification policy was not enforced for this caller. Permissions and CRM writes still apply.",
        missingRequiredEvidence: [],
        requiresHumanReview: false,
        salesMotion: settings.salesMotion,
        requiredEvidenceFields: [...settings.requiredEvidenceFields],
      };
      if (existing.isQualified) {
        return {
          lead: existing,
          policy: {
            outcome: "already_qualified",
            reason: "lead_already_qualified",
            explanation: "Lead is already marked qualified; no CRM write performed.",
            missingRequiredEvidence: [],
            requiresHumanReview: false,
            salesMotion: settings.salesMotion,
            requiredEvidenceFields: [...settings.requiredEvidenceFields],
          },
          qualificationApplied: false,
        };
      }
    }

    let stage =
      (await this.resolveStageByStatus(input.companyId, existing.pipelineId, "qualified")) ?? null;
    if (input.stageId) {
      const requested = await this.deps.leads.getStage(input.companyId, input.stageId);
      if (!requested) throw new LeadNotFoundError("Stage", input.stageId);
      if (requested.pipelineId !== existing.pipelineId) {
        throw new LeadValidationError("Stage does not belong to the lead pipeline.");
      }
      if (requested.lifecycleStatus !== "qualified") {
        throw new LeadValidationError("stageId must reference a stage with lifecycle status qualified.");
      }
      stage = requested;
    }
    assertStageTransition(existing.lifecycleStatus, "qualified", {
      source: input.auditSource ?? "human",
    });

    const metadata = input.messageId
      ? {
          ...existing.metadata,
          salesQualificationMessageId: input.messageId,
          salesQualificationOutcome: "qualified",
        }
      : undefined;

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      isQualified: true,
      lifecycleStatus: "qualified",
      stageId: stage?.id ?? existing.stageId,
      score: input.score ?? existing.score,
      qualifiedAt: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    });

    await this.recordHistory(
      input.companyId,
      input.leadId,
      "lifecycle_status",
      existing.lifecycleStatus,
      "qualified",
      "qualify",
      actorUserId,
    );
    const opportunitySync = await this.syncOpportunityStage(
      input.companyId,
      input.leadId,
      existing.lifecycleStatus,
      "qualified",
      actorUserId,
    );
    await this.recordStageAudit({
      companyId: input.companyId,
      leadId: input.leadId,
      activityType: "lead_qualified",
      summary: "Qualification applied from verified evidence",
      actorUserId,
      payload: {
        previousLifecycle: existing.lifecycleStatus,
        newLifecycle: "qualified",
        previousStageId: existing.stageId,
        newStageId: stage?.id ?? existing.stageId,
        reason: input.auditReason ?? policyResult.reason,
        source: input.auditSource ?? "human",
        evidence: salesEvidenceAuditSnapshot(evidence),
        opportunitySync,
      },
    });

    await this.deps.events.publish(
      createLeadQualifiedEvent({ companyId: input.companyId, leadId: input.leadId, qualified: true, actorUserId }),
    );
    return { lead: record, policy: policyResult, qualificationApplied: true };
  }


  /**
   * Resolve settings for qualify: per-request patch (tests) wins, else store row, else null defaults.
   * Always scopes store access to input.companyId after assertLeadCompanyAccess.
   */
  private async resolveSettingsPatchForQualify(
    input: QualifyLeadInput,
  ): Promise<CompanyLeadQualificationSettingsPatch | null> {
    if (input.companySettingsPatch !== undefined) {
      return input.companySettingsPatch;
    }
    const store = this.deps.qualificationSettingsStore;
    if (!store) return null;
    const stored = await store.get(input.companyId);
    if (!stored) return null;
    if (stored.companyId !== input.companyId.trim()) {
      throw new LeadValidationError("Tenant isolation violation: qualification settings company mismatch.");
    }
    return companyLeadQualificationSettingsToPatch(stored);
  }

  /** Read resolved settings (stored override or defaults). Requires leads.view, qualify, or manage. */
  async getLeadQualificationSettings(
    ctx: LeadServiceContext,
    input: { companyId: string },
  ): Promise<{ settings: CompanyLeadQualificationSettings; warnings: string[] }> {
    assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    if (
      !ctx.isSuperAdmin &&
      !ctx.hasPermission(LEAD_PERMISSIONS.view) &&
      !ctx.hasPermission(LEAD_PERMISSIONS.qualify) &&
      !ctx.hasPermission(LEAD_PERMISSIONS.manage)
    ) {
      throw new LeadPermissionDeniedError(LEAD_PERMISSIONS.view);
    }
    const store = this.deps.qualificationSettingsStore;
    if (!store) {
      const resolved = resolveCompanyLeadQualificationPolicyConfig(input.companyId, null);
      return { settings: resolved.settings, warnings: resolved.warnings };
    }
    const resolved = await store.resolve(input.companyId);
    return { settings: resolved.settings, warnings: resolved.warnings };
  }

  /** Persist company policy overrides. Requires leads.manage. */
  async upsertLeadQualificationSettings(
    ctx: LeadServiceContext,
    input: { companyId: string; patch?: CompanyLeadQualificationSettingsPatch | null },
  ): Promise<{ settings: CompanyLeadQualificationSettings }> {
    const actorUserId = assertLeadActor(ctx);
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.manage);
    const store = this.deps.qualificationSettingsStore;
    if (!store) {
      throw new LeadValidationError("Lead qualification settings store is not configured.");
    }
    const settings = await store.upsert(input.companyId, input.patch ?? null, {
      updatedBy: actorUserId,
    });
    if (settings.companyId !== input.companyId.trim()) {
      throw new LeadValidationError("Tenant isolation violation: qualification settings company mismatch.");
    }
    return { settings };
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

    const primary = await this.requireLead(input.companyId, input.primaryLeadId);
    const uniqueDuplicates = [...new Set(input.duplicateLeadIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueDuplicates.length === 0) {
      throw new LeadValidationError("At least one duplicate lead id is required.");
    }
    for (const duplicateLeadId of uniqueDuplicates) {
      if (duplicateLeadId === input.primaryLeadId) {
        throw new LeadValidationError("A lead cannot be merged into itself.");
      }
      const duplicate = await this.requireLead(input.companyId, duplicateLeadId);
      if (!leadsShareVerifiedIdentity(primary, duplicate)) {
        throw new LeadValidationError(
          "Leads can be merged only when they share a verified phone or email. Name similarity is not enough.",
        );
      }
    }

    const record = await this.deps.leads.mergeLeads({
      companyId: input.companyId,
      primaryLeadId: input.primaryLeadId,
      duplicateLeadIds: uniqueDuplicates,
      updatedBy: actorUserId,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "lead", input.primaryLeadId, {
      merged: uniqueDuplicates,
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
    input: {
      companyId: string;
      leadId: string;
      stageId: string;
      stageAudit?: {
        source?: StageAuditSource;
        reason?: string;
        evidence?: SalesEvidence;
      };
    },
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

    if (existing.stageId === stage.id && existing.lifecycleStatus === stage.lifecycleStatus) {
      return { lead: existing };
    }

    const pipeline = await this.deps.leads.getPipeline(input.companyId, existing.pipelineId);
    const source = input.stageAudit?.source ?? "human";
    assertStageTransition(existing.lifecycleStatus, stage.lifecycleStatus, {
      allowBackward: pipeline?.allowBackwardStageMovement ?? true,
      source,
    });

    if (stage.lifecycleStatus === "won") {
      const accepted = this.deps.saleCompletion
        ? await this.deps.saleCompletion.hasAcceptedQuoteForLead({
            companyId: input.companyId,
            leadId: existing.id,
          })
        : false;
      if (!accepted) {
        throw new LeadStageTransitionError(existing.lifecycleStatus, "won", "sale_completion_required");
      }
    }

    // Formal qualification must go through qualifyLead (lead_qualified + qualified_at).
    // Soft-setting isQualified from a Kanban stage move is not allowed.
    if (stage.lifecycleStatus === "qualified" && !existing.isQualified) {
      // Human Kanban authority — policy not enforced; still requires leads.qualify.
      return this.qualifyLead(ctx, {
        companyId: input.companyId,
        leadId: input.leadId,
        stageId: stage.id,
        qualificationPolicyMode: "human_override",
        auditSource: source,
        auditReason: input.stageAudit?.reason ?? "human_stage_qualified",
      });
    }

    const record = await this.deps.leads.updateLead({
      companyId: input.companyId,
      leadId: input.leadId,
      updatedBy: actorUserId,
      stageId: stage.id,
      lifecycleStatus: stage.lifecycleStatus,
      // Preserve prior qualification flag; do not auto-disqualify on stage leave.
      isQualified: existing.isQualified,
    });

    await this.recordHistory(input.companyId, input.leadId, "stage_id", existing.stageId, stage.id, "change_stage", actorUserId);
    await this.recordHistory(
      input.companyId,
      input.leadId,
      "lifecycle_status",
      existing.lifecycleStatus,
      stage.lifecycleStatus,
      "change_stage",
      actorUserId,
    );
    const opportunitySync = await this.syncOpportunityStage(
      input.companyId,
      input.leadId,
      existing.lifecycleStatus,
      stage.lifecycleStatus,
      actorUserId,
    );
    await this.recordStageAudit({
      companyId: input.companyId,
      leadId: input.leadId,
      activityType: "stage_changed",
      summary: "Stage changed",
      actorUserId,
      payload: {
        previousLifecycle: existing.lifecycleStatus,
        newLifecycle: stage.lifecycleStatus,
        previousStageId: existing.stageId,
        newStageId: stage.id,
        reason: input.stageAudit?.reason ?? "stage_change",
        source,
        evidence: salesEvidenceAuditSnapshot(input.stageAudit?.evidence ?? {}),
        opportunitySync,
      },
    });
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

    // «تم التحويل» is the customer handoff. Won stays a lead until this column.
    // The card remains on the converted stage; the customer record keeps the journey.
    if (stage.lifecycleStatus === "converted" && !record.customerId) {
      try {
        const [tags, notes, history, activities, stages] = await Promise.all([
          this.deps.leads.listTags(input.companyId, input.leadId),
          this.deps.leads.listNotes(input.companyId, input.leadId),
          this.deps.leads.listHistory(input.companyId, input.leadId, 100),
          this.deps.leads.listActivities(input.companyId, input.leadId, 100),
          this.deps.leads.listStages(input.companyId, record.pipelineId),
        ]);
        const stageName = new Map(stages.map((item) => [item.id, item.name]));
        const phoneRegion =
          typeof record.metadata.phoneRegion === "string"
            ? record.metadata.phoneRegion
            : typeof record.metadata.phone_country_iso === "string"
              ? record.metadata.phone_country_iso
              : null;
        const preservedPayload = {
          tags: tags.map((tag) => tag.tag),
          notes: notes.map((note) => ({ body: note.body, createdAt: note.createdAt })),
          sourceId: record.sourceId,
          conversationId: record.conversationId,
          aiSummary: record.aiSummary,
          score: record.score,
          metadata: record.metadata,
          phoneRegion,
          journey: formatLeadPurchaseJourney({
            lead: record,
            stageName,
            history,
            activities,
            notes,
            tags: tags.map((tag) => tag.tag),
          }),
        };
        const converted = await this.deps.conversion.convertLead({
          companyId: input.companyId,
          leadId: input.leadId,
          contactName: record.contactName || record.title,
          email: record.email,
          phone: record.phone,
          companyName: record.companyName,
          actorUserId,
          preservedPayload,
        });
        const linked = await this.deps.leads.updateLead({
          companyId: input.companyId,
          leadId: input.leadId,
          updatedBy: actorUserId,
          customerId: converted.customerId,
        });
        await this.deps.leads.recordConversion({
          companyId: input.companyId,
          leadId: input.leadId,
          customerId: converted.customerId,
          opportunityId: converted.opportunityId ?? null,
          convertedBy: actorUserId,
          preservedPayload: { source: "kanban_converted", journey: preservedPayload.journey },
        });
        await this.deps.events.publish(
          createLeadConvertedEvent({
            companyId: input.companyId,
            leadId: input.leadId,
            customerId: converted.customerId,
            opportunityId: converted.opportunityId ?? null,
            actorUserId,
          }),
        );
        record.customerId = linked.customerId;
      } catch (error) {
        console.warn("[lead-converted-customer]", {
          companyId: input.companyId,
          leadId: input.leadId,
          err: error instanceof Error ? { message: error.message, name: error.name } : error,
        });
      }
    }

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
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.leads.appendActivity({ companyId, leadId, activityType, summary, actorUserId, payload });
  }

  private async recordStageAudit(input: {
    companyId: string;
    leadId: string;
    activityType: string;
    summary: string;
    actorUserId: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.recordActivity(
        input.companyId,
        input.leadId,
        input.activityType,
        input.summary,
        input.actorUserId,
        input.payload,
      );
    } catch (error) {
      console.warn("[lead-stage-audit]", {
        companyId: input.companyId,
        leadId: input.leadId,
        activityType: input.activityType,
        err: error instanceof Error ? { message: error.message, name: error.name } : error,
      });
    }
  }

  /** Best-effort. A refused Opportunity move is recorded; it never rolls back the Lead. */
  private async syncOpportunityStage(
    companyId: string,
    leadId: string,
    fromLifecycleStatus: string,
    toLifecycleStatus: string,
    actorUserId: string | null,
  ): Promise<{ status: string; fromStageKey?: string | null; toStageKey?: string | null } | null> {
    if (!this.deps.opportunityStageSync) return null;
    try {
      const sync = await this.deps.opportunityStageSync.onLeadLifecycleChanged({
        companyId,
        leadId,
        fromLifecycleStatus,
        toLifecycleStatus,
        actorUserId,
      });
      if (sync.status === "failed") {
        console.warn("[lead-opportunity-stage-sync]", {
          companyId,
          leadId,
          status: sync.status,
          opportunityId: sync.opportunityId ?? null,
        });
      }
      return {
        status: sync.status,
        fromStageKey: "fromStageKey" in sync ? (sync.fromStageKey as string | null | undefined) : undefined,
        toStageKey: "toStageKey" in sync ? (sync.toStageKey as string | null | undefined) : undefined,
      };
    } catch (error) {
      console.warn("[lead-opportunity-stage-sync] unexpected error", {
        companyId,
        leadId,
        err: error instanceof Error ? { message: error.message, name: error.name } : error,
      });
      return { status: "failed" };
    }
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
