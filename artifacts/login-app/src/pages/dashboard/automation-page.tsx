import { AutomationLayout } from "@/pages/dashboard/automation/automation-layout";
import { WorkflowBuilderServicesProvider } from "@/workflow-builder/context/workflow-builder-services";
import { registerBuiltInWorkflowNodes } from "@/workflow-builder/core/register-built-in-nodes";
import { registerBuiltInVariableProviders } from "@/workflow-builder/core/variables/built-in-variable-providers";
import { registerDefaultNodeRenderers } from "@/workflow-builder/core/registry/node-renderer-registry";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();
registerDefaultNodeRenderers();

export default function AutomationSectionPage() {
  return (
    <WorkflowBuilderServicesProvider>
      <AutomationLayout />
    </WorkflowBuilderServicesProvider>
  );
}
