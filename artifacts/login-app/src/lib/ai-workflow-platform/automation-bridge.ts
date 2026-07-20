import type { ExecutionContext } from "@workspace/automation-platform";
import type { AIWorkflowAutomationContext } from "@workspace/ai-workflow-platform";

export function toAIWorkflowAutomationContext(context: ExecutionContext): AIWorkflowAutomationContext {
  return {
    company: { id: context.company.id },
    flow: { id: context.flow.id },
    run: { id: context.run.id },
    session: { id: context.session.id },
    variables: context.variables,
    customer: { id: context.customer.id },
    currentNode: { config: context.currentNode.config },
    input: context.input,
  };
}
