import { AUTOMATION_PERMISSIONS } from "../constants.js";
import {
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  AutomationFlowVersionNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
} from "../repositories/automation-repositories.js";
import type { ServiceContext } from "../types.js";
import { WorkflowAuditService } from "./audit-service.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { RollbackWorkflowInput, WorkflowGraphSnapshot } from "./types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
}

async function restoreDraftFromSnapshot(
  flowId: string,
  snapshot: WorkflowGraphSnapshot,
  nodes: AutomationNodeRepository,
  edges: AutomationEdgeRepository,
): Promise<void> {
  await nodes.deleteByFlowId(flowId);
  await edges.deleteByFlowId(flowId);
  const idMap = new Map<string, string>();
  for (const node of snapshot.nodes) {
    const created = await nodes.create({
      flowId,
      type: node.type,
      config: node.config,
      positionX: node.positionX,
      positionY: node.positionY,
    });
    idMap.set(node.id, created.id);
  }
  for (const edge of snapshot.edges) {
    await edges.create({
      flowId,
      sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId,
      condition: edge.condition,
    });
  }
}

export class WorkflowRollbackService {
  constructor(
    private readonly flows: AutomationFlowRepository,
    private readonly versions: AutomationFlowVersionRepository,
    private readonly nodes: AutomationNodeRepository,
    private readonly edges: AutomationEdgeRepository,
    private readonly audit: WorkflowAuditService,
  ) {}

  async rollback(ctx: ServiceContext, input: RollbackWorkflowInput) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.rollback);
    const flow = await this.flows.findById(input.flowId);
    if (!flow) throw new AutomationFlowNotFoundError(input.flowId);
    assertCompanyAccess(ctx, flow.company_id);
    if (flow.status !== "active" && flow.status !== "disabled") {
      throw new AutomationFlowStateError("Only published workflows can be rolled back.");
    }

    const target = await this.versions.findByFlowAndNumber(flow.id, input.targetVersionNumber);
    if (!target) throw new AutomationFlowVersionNotFoundError(`${flow.id}@${input.targetVersionNumber}`);

    const activeVersion = await this.versions.setActiveVersion(flow.id, target.id);
    const updated = await this.flows.update({
      flowId: flow.id,
      activeVersionId: activeVersion.id,
      version: target.version_number,
      hasUnpublishedDraft: input.restoreDraft !== false,
      status: "active",
      updatedBy: ctx.userId,
    });

    if (input.restoreDraft !== false) {
      await restoreDraftFromSnapshot(flow.id, target.snapshot, this.nodes, this.edges);
    }

    this.audit.record({
      flowId: flow.id,
      companyId: flow.company_id,
      action: "rolled_back",
      versionNumber: target.version_number,
      userId: ctx.userId,
    });

    return { flow: updated, version: activeVersion };
  }
}
