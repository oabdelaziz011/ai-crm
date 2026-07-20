export type AIWorkflowAutomationContext = {
  company: { id: string };
  flow: { id: string };
  run: { id: string };
  session: { id: string };
  variables: Record<string, unknown>;
  customer: { id: string | null };
  currentNode: { config: Record<string, unknown> };
  input?: Record<string, unknown>;
};

export type AIWorkflowNodeExecutionResult = {
  outcome: "continue" | "waiting_input" | "completed" | "failed";
  variables?: Record<string, unknown>;
  errorMessage?: string;
  output?: Record<string, unknown>;
};

export type WorkflowActionHandlerLike = {
  type: "action";
  validate(context: AIWorkflowAutomationContext): void | Promise<void>;
  execute(context: AIWorkflowAutomationContext): AIWorkflowNodeExecutionResult | Promise<AIWorkflowNodeExecutionResult>;
};
