import { AUTOMATION_PERMISSIONS } from "../constants.js";
import { AutomationFlowNotFoundError, OrchestratorTriggerNotFoundError, PermissionDeniedError } from "../errors.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { AutomationExecutionResult, ServiceContext, TriggerDispatchInput } from "../types.js";
import type { AutomationEngine } from "../engine/automation-engine.js";
import { mapOrchestratorTriggerToFlowTrigger } from "./conversation-resolver.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export class TriggerDispatcher {
  constructor(
    private readonly deps: {
      flows: AutomationFlowRepository;
      engine: AutomationEngine;
    },
  ) {}

  async resolveFlowId(input: TriggerDispatchInput): Promise<string> {
    if (input.flowId) {
      const flow = await this.deps.flows.findById(input.flowId);
      if (!flow || flow.company_id !== input.companyId) throw new AutomationFlowNotFoundError(input.flowId);
      if (flow.status !== "active") throw new AutomationFlowNotFoundError(input.flowId);
      return flow.id;
    }

    const triggerType = mapOrchestratorTriggerToFlowTrigger(input.trigger);
    const candidates = await this.deps.flows.list({
      companyId: input.companyId,
      status: "active",
      triggerType,
    });
    const flow = candidates[0];
    if (!flow) throw new OrchestratorTriggerNotFoundError(input.trigger);
    return flow.id;
  }

  async dispatch(ctx: ServiceContext, input: TriggerDispatchInput): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    const flowId = await this.resolveFlowId(input);
    return this.deps.engine.start(ctx, {
      companyId: input.companyId,
      flowId,
      channel: input.channel,
      triggerSource: input.triggerSource ?? input.trigger,
      externalUserId: input.externalUserId ?? null,
      customerId: input.customerId ?? null,
      initialVariables: {
        ...(input.initialVariables ?? {}),
        __trigger: input.trigger,
      },
    });
  }
}
