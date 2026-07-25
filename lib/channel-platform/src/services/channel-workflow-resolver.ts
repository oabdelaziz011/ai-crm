import type { ChannelWorkflowBindingRepository } from "../repositories/channel-workflow-binding-repository.js";

export type ResolvedChannelWorkflow = {
  companyId: string;
  companyChannelId: string;
  automationFlowId: string;
};

export type ChannelWorkflowFlowValidator = {
  isExecutableFlow(flowId: string, companyId: string): Promise<boolean>;
};

export type ChannelWorkflowResolverDeps = {
  bindings: ChannelWorkflowBindingRepository;
  flowValidator: ChannelWorkflowFlowValidator;
};

export class ChannelWorkflowResolver {
  constructor(private readonly deps: ChannelWorkflowResolverDeps) {}

  async resolve(companyChannelId: string): Promise<ResolvedChannelWorkflow | null> {
    const binding = await this.deps.bindings.findByCompanyChannelId(companyChannelId);
    if (!binding || !binding.is_enabled) {
      return null;
    }

    const executable = await this.deps.flowValidator.isExecutableFlow(
      binding.automation_flow_id,
      binding.company_id,
    );
    if (!executable) {
      return null;
    }

    return {
      companyId: binding.company_id,
      companyChannelId: binding.company_channel_id,
      automationFlowId: binding.automation_flow_id,
    };
  }
}
