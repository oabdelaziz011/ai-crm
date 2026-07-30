import { AUTOMATION_PERMISSIONS } from "../constants.js";
import {
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  DuplicateAutomationFlowError,
  ValidationError,
} from "../errors.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type {
  CreateAutomationFlowInput,
  ListAutomationFlowsFilter,
  ServiceContext,
  UpdateAutomationFlowInput,
} from "../types.js";
import {
  assertCompanyAccess,
  assertPermission,
  assertWorkflowTenantAccess,
} from "../utils/workflow-guards.js";

export class AutomationFlowService {
  constructor(private readonly flowRepository: AutomationFlowRepository) {}

  async createFlow(ctx: ServiceContext, input: CreateAutomationFlowInput) {
    assertWorkflowTenantAccess(ctx, input.companyId, AUTOMATION_PERMISSIONS.create);
    if (!input.name.trim()) throw new ValidationError("Flow name is required.");
    const existing = await this.flowRepository.findByName(input.companyId, input.name.trim());
    if (existing) throw new DuplicateAutomationFlowError(input.name.trim());
    return this.flowRepository.create({
      ...input,
      name: input.name.trim(),
      createdBy: ctx.userId,
    });
  }

  async updateFlow(ctx: ServiceContext, input: UpdateAutomationFlowInput) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.edit);
    const flow = await this.requireFlow(input.flowId);
    assertWorkflowTenantAccess(ctx, flow.company_id, AUTOMATION_PERMISSIONS.edit);
    if (flow.status === "archived") {
      throw new AutomationFlowStateError("Archived flows cannot be edited.");
    }
    if (input.name?.trim()) {
      const duplicate = await this.flowRepository.findByName(flow.company_id, input.name.trim());
      if (duplicate && duplicate.id !== flow.id) throw new DuplicateAutomationFlowError(input.name.trim());
    }
    return this.flowRepository.update({ ...input, updatedBy: ctx.userId });
  }

  async getFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.view);
    const flow = await this.requireFlow(flowId);
    assertCompanyAccess(ctx, flow.company_id);
    return flow;
  }

  async listFlows(ctx: ServiceContext, filter: ListAutomationFlowsFilter) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.flowRepository.list(filter);
  }

  async publishFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.publish);
    const flow = await this.requireFlow(flowId);
    assertWorkflowTenantAccess(ctx, flow.company_id, AUTOMATION_PERMISSIONS.publish);
    if (flow.status === "active") return flow;
    if (flow.status !== "draft" && flow.status !== "disabled") {
      throw new AutomationFlowStateError(`Flow in status ${flow.status} cannot be published.`);
    }
    return this.flowRepository.updateStatus(flowId, "active", ctx.userId);
  }

  async disableFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.edit);
    const flow = await this.requireFlow(flowId);
    assertWorkflowTenantAccess(ctx, flow.company_id, AUTOMATION_PERMISSIONS.edit);
    if (flow.status === "disabled") return flow;
    if (flow.status !== "active") {
      throw new AutomationFlowStateError(`Flow in status ${flow.status} cannot be disabled.`);
    }
    return this.flowRepository.updateStatus(flowId, "disabled", ctx.userId);
  }

  async archiveFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.archive);
    const flow = await this.requireFlow(flowId);
    assertWorkflowTenantAccess(ctx, flow.company_id, AUTOMATION_PERMISSIONS.archive);
    if (flow.status === "archived") return flow;
    return this.flowRepository.updateStatus(flowId, "archived", ctx.userId);
  }

  async deleteFlow(ctx: ServiceContext, flowId: string) {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.delete);
    const flow = await this.requireFlow(flowId);
    assertWorkflowTenantAccess(ctx, flow.company_id, AUTOMATION_PERMISSIONS.delete);
    if (flow.status === "active") {
      throw new AutomationFlowStateError("Active flows must be disabled before deletion.");
    }
    return this.flowRepository.softDelete({ id: flowId, deletedBy: ctx.userId });
  }

  private async requireFlow(flowId: string) {
    const flow = await this.flowRepository.findById(flowId);
    if (!flow) throw new AutomationFlowNotFoundError(flowId);
    return flow;
  }
}
