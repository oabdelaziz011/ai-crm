import { AUTOMATION_PERMISSIONS } from "../constants.js";
import {
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  PermissionDeniedError,
} from "../errors.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { ServiceContext } from "../types.js";
import { WorkflowAuditService } from "./audit-service.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
}

export class WorkflowLifecycleService {
  constructor(
    private readonly flows: AutomationFlowRepository,
    private readonly versions: AutomationFlowVersionRepository,
    private readonly audit: WorkflowAuditService,
  ) {}

  async getLifecycle(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.view);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    const versions = await this.versions.listByFlowId(flowId);
    const activeVersion = await this.versions.findActiveByFlowId(flowId);
    return { flow, versions, activeVersion, audit: this.audit.listByFlowId(flowId) };
  }

  async beginDraftEdit(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.edit);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    if (flow.status === "archived") {
      throw new AutomationFlowStateError("Archived workflows cannot be edited.");
    }
    if (flow.status === "active" && flow.active_version_id) {
      return this.flows.update({
        flowId,
        hasUnpublishedDraft: true,
        updatedBy: ctx.userId,
      });
    }
    return flow;
  }

  async markDraftSaved(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.edit);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    this.audit.record({
      flowId,
      companyId: flow.company_id,
      action: "draft_saved",
      userId: ctx.userId,
    });
    if (flow.status === "active") {
      return this.flows.update({ flowId, hasUnpublishedDraft: true, updatedBy: ctx.userId });
    }
    return flow;
  }

  async archiveFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.archive);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    const updated = await this.flows.updateStatus(flowId, "archived", ctx.userId);
    this.audit.record({
      flowId,
      companyId: flow.company_id,
      action: "archived",
      userId: ctx.userId,
      versionNumber: flow.version,
    });
    return updated;
  }

  async listVersions(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.view);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    return this.versions.listByFlowId(flowId);
  }

  async getVersion(ctx: ServiceContext, versionId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.view);
    const version = await this.versions.findById(versionId);
    if (!version) throw new AutomationFlowNotFoundError(versionId);
    assertCompanyAccess(ctx, version.company_id);
    return version;
  }

  private async requireFlow(flowId: string) {
    const flow = await this.flows.findById(flowId);
    if (!flow) throw new AutomationFlowNotFoundError(flowId);
    return flow;
  }
}
