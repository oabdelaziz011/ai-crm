import { AUTOMATION_PERMISSIONS } from "../constants.js";
import {
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { ServiceContext } from "../types.js";
import { WorkflowAuditService } from "./audit-service.js";
import { hasBlockingPublishIssues, validateWorkflowSnapshot } from "./publish-validation.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { PublishWorkflowInput } from "./types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
}

export class WorkflowPublishService {
  constructor(
    private readonly flows: AutomationFlowRepository,
    private readonly versions: AutomationFlowVersionRepository,
    private readonly audit: WorkflowAuditService,
  ) {}

  async publish(ctx: ServiceContext, input: PublishWorkflowInput) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.publish);
    const flow = await this.flows.findById(input.flowId);
    if (!flow) throw new AutomationFlowNotFoundError(input.flowId);
    assertCompanyAccess(ctx, flow.company_id);
    if (flow.status === "archived") {
      throw new AutomationFlowStateError("Archived workflows cannot be published.");
    }

    const issues = validateWorkflowSnapshot(input.snapshot);
    if (hasBlockingPublishIssues(issues)) {
      throw new ValidationError(issues[0]?.message ?? "This workflow is not ready to publish yet.");
    }

    const versionNumber = await this.versions.getNextVersionNumber(flow.id);
    const version = await this.versions.create({
      flowId: flow.id,
      companyId: flow.company_id,
      versionNumber,
      releaseNotes: input.releaseNotes ?? "",
      snapshot: input.snapshot,
      publishedBy: ctx.userId,
    });
    const activeVersion = await this.versions.setActiveVersion(flow.id, version.id);

    const updated = await this.flows.update({
      flowId: flow.id,
      name: input.snapshot.name,
      description: input.snapshot.description,
      triggerType: input.snapshot.triggerType,
      metadata: input.snapshot.metadata,
      updatedBy: ctx.userId,
      activeVersionId: activeVersion.id,
      version: versionNumber,
      hasUnpublishedDraft: false,
      status: "active",
    });

    this.audit.record({
      flowId: flow.id,
      companyId: flow.company_id,
      action: "published",
      versionNumber,
      userId: ctx.userId,
      details: { releaseNotes: input.releaseNotes ?? "" },
    });

    return { flow: updated, version: activeVersion, issues };
  }
}
