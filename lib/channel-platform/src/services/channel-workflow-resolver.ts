import type { ChannelWorkflowBindingRepository } from "../repositories/channel-workflow-binding-repository.js";

export type ResolvedChannelWorkflow = {
  companyId: string;
  companyChannelId: string;
  automationFlowId: string;
};

export type ChannelWorkflowSkipReason =
  | "no_binding"
  | "binding_disabled"
  | "flow_not_executable";

export type ChannelWorkflowResolution =
  | { status: "resolved"; workflow: ResolvedChannelWorkflow }
  | { status: "skipped"; reason: ChannelWorkflowSkipReason; automationFlowId?: string };

export type ChannelWorkflowFlowValidator = {
  isExecutableFlow(flowId: string, companyId: string): Promise<boolean>;
};

export type ChannelWorkflowResolverDeps = {
  bindings: ChannelWorkflowBindingRepository;
  flowValidator: ChannelWorkflowFlowValidator;
};

export class ChannelWorkflowResolver {
  constructor(private readonly deps: ChannelWorkflowResolverDeps) {}

  async resolveDetail(companyChannelId: string): Promise<ChannelWorkflowResolution> {
    const binding = await this.deps.bindings.findByCompanyChannelId(companyChannelId);
    if (!binding) {
      return { status: "skipped", reason: "no_binding" };
    }

    if (!binding.is_enabled) {
      return {
        status: "skipped",
        reason: "binding_disabled",
        automationFlowId: binding.automation_flow_id,
      };
    }

    const executable = await this.deps.flowValidator.isExecutableFlow(
      binding.automation_flow_id,
      binding.company_id,
    );
    if (!executable) {
      return {
        status: "skipped",
        reason: "flow_not_executable",
        automationFlowId: binding.automation_flow_id,
      };
    }

    return {
      status: "resolved",
      workflow: {
        companyId: binding.company_id,
        companyChannelId: binding.company_channel_id,
        automationFlowId: binding.automation_flow_id,
      },
    };
  }

  async resolve(companyChannelId: string): Promise<ResolvedChannelWorkflow | null> {
    const resolution = await this.resolveDetail(companyChannelId);
    return resolution.status === "resolved" ? resolution.workflow : null;
  }
}
